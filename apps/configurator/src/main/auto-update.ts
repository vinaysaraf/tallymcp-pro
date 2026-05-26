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
import type { UpdateStatus } from "../shared/ipc-types.js";

const REPO_OWNER = "vinaysaraf";
const REPO_NAME = "tallymcp-pro";

function releaseNotesUrlFor(version: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${version}`;
}

export interface CreateAutoUpdaterInput {
  /** Installed app version, e.g. "1.0.0". Usually `app.getVersion()`. */
  currentVersion: string;
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

  // Wire to electron-updater events. autoUpdater is a singleton across the
  // process, so calling this multiple times would double-subscribe — guard
  // against it in production by only constructing one autoUpdater per
  // process (Task 4 instantiates exactly once in main/index.ts).
  autoUpdater.autoDownload = false; // user-clicks-Update UX (spec §10)
  autoUpdater.autoInstallOnAppQuit = false; // explicit consent only

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
