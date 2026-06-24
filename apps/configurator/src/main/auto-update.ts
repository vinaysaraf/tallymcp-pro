/**
 * Real `electron-updater` integration that replaces Phase 2's
 * `checkForUpdatesStub`. The factory function `createAutoUpdater` is pure
 * apart from its electron-updater calls — it doesn't subscribe to
 * Electron's `app` directly, so unit tests can mock electron-updater and
 * drive the state machine through realistic transitions.
 *
 * State machine (matches the spec §10 update flow):
 *
 *   up-to-date
 *      │  autoUpdater "update-available"
 *      ▼
 *   update-available
 *      │  user clicks "Update now" → downloadUpdate()
 *      ▼
 *   downloading       (autoUpdater "download-progress" → updates downloadProgress)
 *      │  autoUpdater "update-downloaded"
 *      ▼
 *   ready-to-install
 *      │  user clicks "Restart now" → quitAndInstall()
 *      ▼
 *   (process restarts into the new version)
 *
 * The download and install are two SEPARATE user-consent steps. The
 * banner's "Update now" only kicks off the download; the user later
 * confirms via "Restart now" once the banner shows ready-to-install.
 * (Cursor review C1, 2026-05-26.)
 *
 * "error" is a sticky state from any of the above; subsequent transitions
 * still happen but the renderer should surface it.
 *
 * Spec: docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md §10.
 */

import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UpdateStatus } from "../shared/ipc-types.js";

const REPO_OWNER = "vinaysaraf";
const REPO_NAME = "tallymcp-pro";

function releaseNotesUrlFor(version: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${version}`;
}

/**
 * Minimal, dependency-free logger for electron-updater. Until v1.0.7 the
 * updater had NO logger wired, so download/verify failures (e.g. the
 * per-machine v1.0.4 → v1.0.5 loop) vanished into an uncaptured console with
 * no way to diagnose them. This writes every updater event to `logFile`
 * (and stderr) so a failed in-app update is now self-diagnosing.
 */
function makeUpdaterLogger(logFile?: string): {
  info: (...a: unknown[]) => void;
  warn: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
  debug: (...a: unknown[]) => void;
} {
  const write = (level: string, args: unknown[]): void => {
    const line = `[${new Date().toISOString()}] [updater:${level}] ${args
      .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a)))
      .join(" ")}\n`;
    process.stderr.write(line);
    if (logFile) {
      try {
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(logFile, line);
      } catch {
        /* logging must never throw */
      }
    }
  };
  return {
    info: (...a) => write("info", a),
    warn: (...a) => write("warn", a),
    error: (...a) => write("error", a),
    debug: (...a) => write("debug", a),
  };
}

/**
 * Authenticode statuses that mean "the file carries an intact signature whose
 * bytes were NOT tampered with" — even when the chain doesn't terminate in a
 * CA root Windows trusts. A self-signed build reports `UnknownError` /
 * `NotTrusted` here (valid chain, untrusted root); a tampered or unsigned file
 * reports `HashMismatch` / `NotSigned`, which we always reject.
 */
const SIGNATURE_STATUS_ACCEPTED = new Set(["Valid", "UnknownError", "NotTrusted"]);

/**
 * SHA-1 Authenticode thumbprint(s) of the code-signing certificate(s) the
 * build is signed with (the `CSC_LINK` secret used in CI). We pin on the
 * thumbprint — NOT just the certificate CN, which any self-signed cert can
 * trivially spoof — so that ONLY a build signed by this exact certificate is
 * accepted. Even an attacker who could replace the GitHub release artifacts
 * and sign a malicious installer with their own `CN=Vinay Saraf` self-signed
 * cert would be rejected here (their thumbprint won't match).
 *
 * Rotating the signing cert: ADD the new thumbprint to this set in a release
 * that ships BEFORE the cert actually changes, so the already-installed
 * version still trusts the next (new-cert) build. Remove the old one a release
 * later. Thumbprints are compared case-insensitively with non-hex separators
 * stripped.
 */
const EXPECTED_CERT_THUMBPRINTS = new Set(["8EB4845848E2785A76A3052AA1F075319086381C"]);

function normaliseThumbprint(thumbprint: string): string {
  return thumbprint.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

export type PowerShellRunner = (script: string) => Promise<string>;

const defaultPowerShellRunner: PowerShellRunner = (script) =>
  new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 20_000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function extractCn(subject: string): string {
  // Subject looks like `CN=Vinay Saraf, O=..., C=IN` (or just `CN=Vinay Saraf`).
  const match = /CN=("([^"]*)"|([^,]+))/i.exec(subject);
  return (match?.[2] ?? match?.[3] ?? "").trim();
}

/**
 * Thumbprint-pinned signature check used IN PLACE OF electron-updater's
 * default Windows verification.
 *
 * WHY: the app is signed with a SELF-SIGNED certificate (CN=Vinay Saraf,
 * issued by itself). electron-updater's stock check requires the signature to
 * chain to a CA root Windows trusts and therefore REJECTS every self-signed
 * update ("New version X is not signed by the application owner" — the exact
 * failure recorded in updater.log). This override deliberately relaxes the ONE
 * requirement a self-signed cert can never satisfy — the trusted-root chain —
 * while still PINNING the signer to our exact certificate by its SHA-1
 * thumbprint (see EXPECTED_CERT_THUMBPRINTS). The thumbprint — not the CN,
 * which any self-signed cert can spoof — is the authoritative check: forging
 * it requires our private key, and electron-updater independently verifies the
 * download's SHA-512 against the (HTTPS-served) latest.yml. User-approved
 * trade-off: drop CA-root trust, keep signature integrity + exact-cert pinning.
 *
 * `publisherNames` (from electron-updater's config) is used only for a clearer
 * rejection message; the thumbprint is what gates acceptance.
 *
 * Returns `null` to ACCEPT (electron-updater's contract) or an error string to
 * REJECT. Fails CLOSED — any inability to inspect the signature returns an
 * error string, which the UI now surfaces (an amber "couldn't auto-update,
 * download manually" banner) instead of letting it vanish silently.
 */
export async function verifyPublisherName(
  publisherNames: string[],
  filePath: string,
  runPowerShell: PowerShellRunner = defaultPowerShellRunner,
): Promise<string | null> {
  void publisherNames; // identity is pinned by thumbprint, not CN (see above)

  let parsed: { status?: string; subject?: string; thumbprint?: string };
  try {
    const script =
      `$ErrorActionPreference='Stop';` +
      `$s=Get-AuthenticodeSignature -LiteralPath ${psSingleQuote(filePath)};` +
      `$c=$s.SignerCertificate;` +
      `$subject=if($c){$c.Subject}else{''};` +
      `$thumbprint=if($c){$c.Thumbprint}else{''};` +
      `[pscustomobject]@{status=$s.Status.ToString();subject=$subject;thumbprint=$thumbprint}|ConvertTo-Json -Compress`;
    parsed = JSON.parse(await runPowerShell(script)) as {
      status?: string;
      subject?: string;
      thumbprint?: string;
    };
  } catch (err) {
    return `Could not verify the update's signature (${(err as Error).message}).`;
  }

  const status = parsed.status ?? "";
  if (!SIGNATURE_STATUS_ACCEPTED.has(status)) {
    return `The downloaded update failed signature verification (status: ${status || "unknown"}).`;
  }
  const thumbprint = normaliseThumbprint(parsed.thumbprint ?? "");
  if (!thumbprint) {
    return "The downloaded update is not signed by a recognised certificate.";
  }
  if (!EXPECTED_CERT_THUMBPRINTS.has(thumbprint)) {
    const cn = extractCn(parsed.subject ?? "");
    return (
      `The downloaded update is signed by an unexpected certificate ` +
      `(CN "${cn || "unknown"}", thumbprint ${thumbprint}) and was rejected.`
    );
  }
  return null;
}

export interface CreateAutoUpdaterInput {
  /** Installed app version, e.g. "1.0.0". Usually `app.getVersion()`. */
  currentVersion: string;
  /**
   * Absolute path for the updater log. Production passes
   * `<userData>/logs/updater.log`; tests may omit it (stderr only).
   */
  logFile?: string;
}

export interface AutoUpdater {
  /** Snapshot of the current state. */
  getStatus: () => UpdateStatus;
  /** Subscribe to state changes. Returns an unsubscriber. */
  subscribe: (cb: (status: UpdateStatus) => void) => () => void;
  /** Trigger an explicit update check. Resolves with the new state. */
  checkForUpdates: () => Promise<UpdateStatus>;
  /**
   * Begin downloading the available update. Returns immediately — progress
   * + completion stream via subscribe(). Captures rejection into the error
   * state instead of throwing (so the renderer can render the error rather
   * than the IPC call rejecting).
   */
  downloadUpdate: () => Promise<void>;
  /**
   * Quit + install + relaunch. No-op unless status is ready-to-install
   * (a "click Restart before download" guard). Synchronous from our
   * perspective — electron-updater's quitAndInstall sends SIGTERM to the
   * Electron process and the new .exe takes over.
   */
  quitAndInstall: () => void;
}

export function createAutoUpdater(input: CreateAutoUpdaterInput): AutoUpdater {
  let status: UpdateStatus = {
    status: "up-to-date",
    currentVersion: input.currentVersion,
  };
  const subscribers = new Set<(s: UpdateStatus) => void>();

  function setStatus(next: UpdateStatus): void {
    status = next;
    for (const cb of subscribers) cb(next);
  }

  // Capture all electron-updater activity to a log file (+ stderr) so a failed
  // in-app update is diagnosable instead of silently looping (v1.0.7).
  autoUpdater.logger = makeUpdaterLogger(input.logFile);

  // Wire to electron-updater events. autoUpdater is a singleton across the
  // process, so calling this multiple times would double-subscribe — guard
  // against it in production by only constructing one autoUpdater per
  // process (Task 4 instantiates exactly once in main/index.ts).
  autoUpdater.autoDownload = false; // user-clicks-Update UX (spec §10)
  autoUpdater.autoInstallOnAppQuit = false; // explicit consent only

  // Replace electron-updater's default Windows signature verification with a
  // publisher-name-pinned check that tolerates our self-signed cert's
  // untrusted root (see verifyPublisherName). Typed via a narrow cast because
  // `verifyUpdateCodeSignature` lives on the platform-specific NsisUpdater, not
  // the `AppUpdater` base that `autoUpdater` is typed as.
  (
    autoUpdater as unknown as {
      verifyUpdateCodeSignature?: (publisherNames: string[], path: string) => Promise<string | null>;
    }
  ).verifyUpdateCodeSignature = (publisherNames, path) => verifyPublisherName(publisherNames, path);

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    setStatus({
      status: "update-available",
      currentVersion: input.currentVersion,
      latestVersion: info.version,
      releaseNotesUrl: releaseNotesUrlFor(info.version),
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setStatus({
      status: "downloading",
      currentVersion: input.currentVersion,
      latestVersion: status.latestVersion,
      downloadProgress: progress.percent / 100,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    setStatus({
      status: "ready-to-install",
      currentVersion: input.currentVersion,
      latestVersion: info.version ?? status.latestVersion,
    });
  });

  autoUpdater.on("error", (err: Error) => {
    setStatus({
      status: "error",
      currentVersion: input.currentVersion,
      latestVersion: status.latestVersion,
      releaseNotesUrl: status.releaseNotesUrl,
      error: err.message,
    });
  });

  return {
    getStatus: () => status,
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    checkForUpdates: async () => {
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        // checkForUpdates rejection (e.g. network failure pre-event-loop)
        // doesn't fire the autoUpdater "error" event in older
        // electron-updater versions. Capture into our error state so the
        // renderer sees something even if the event handler missed it.
        setStatus({
          status: "error",
          currentVersion: input.currentVersion,
          latestVersion: status.latestVersion,
          releaseNotesUrl: status.releaseNotesUrl,
          error: (err as Error).message,
        });
      }
      return status;
    },
    downloadUpdate: async () => {
      // Kick off the download. Returns immediately on success — progress
      // and the eventual ready-to-install transition flow via the
      // download-progress + update-downloaded event handlers above. On
      // rejection (e.g. disk full, network died mid-handshake before
      // autoUpdater fires "error"), capture into our error state so the
      // renderer sees something rather than the IPC call rejecting.
      // (Cursor review H1, 2026-05-26.)
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        setStatus({
          status: "error",
          currentVersion: input.currentVersion,
          latestVersion: status.latestVersion,
          releaseNotesUrl: status.releaseNotesUrl,
          error: (err as Error).message,
        });
      }
    },
    quitAndInstall: () => {
      // Guard: only valid in ready-to-install. Calling earlier is a no-op
      // (defense in depth — the renderer only enables the Restart button
      // in that state, but a buggy renderer or replay attack via the IPC
      // bridge shouldn't be able to quit the app prematurely).
      if (status.status !== "ready-to-install") {
        return;
      }
      autoUpdater.quitAndInstall();
    },
  };
}
