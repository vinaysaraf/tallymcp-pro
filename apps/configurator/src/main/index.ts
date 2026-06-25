import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { registerIpcHandlers, tallyUrlFromConfig } from "./ipc-handlers.js";
import { createTallyPoller } from "./tally-poller.js";
import { createAppMenuTemplate } from "./app-menu.js";
import type { AutoUpdater } from "./auto-update.js";
import {
  IPC_CHANNELS,
  TALLY_STATUS_EVENT,
  UPDATE_STATUS_EVENT,
  type UpdateStatus,
} from "../shared/ipc-types.js";

const GITHUB_PROFILE_URL = "https://github.com/vinaysaraf";
const RELEASES_URL = "https://github.com/vinaysaraf/tallymcp-pro/releases/latest";

/** Where the preload bundle lives relative to the main bundle dir. */
export const PRELOAD_RELATIVE_PATH = "../preload/index.js";

export interface MainWindowOptionsInput {
  preloadAbsolutePath: string;
}

/**
 * Pure function returning the BrowserWindow options. Extracted so tests
 * can verify security defaults without launching Electron.
 */
export function createMainWindowOptions(
  input: MainWindowOptionsInput,
): Electron.BrowserWindowConstructorOptions {
  return {
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 640,
    title: "TallyMCP Configurator",
    backgroundColor: "#f5f7fa",
    show: false,
    webPreferences: {
      preload: input.preloadAbsolutePath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

async function createWindow(): Promise<BrowserWindow> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const preloadAbsolutePath = join(__dirname, PRELOAD_RELATIVE_PATH);

  const win = new BrowserWindow(createMainWindowOptions({ preloadAbsolutePath }));

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  win.once("ready-to-show", () => win.show());
  return win;
}

/** Help → About Me dialog. */
async function showAboutMe(parent: BrowserWindow): Promise<void> {
  const { response } = await dialog.showMessageBox(parent, {
    type: "info",
    title: "About Me",
    message: "CA Vinay Saraf",
    detail: [
      "Membership No. 518215",
      "Email: vinay@vinaysaraf.com",
      `GitHub: ${GITHUB_PROFILE_URL}`,
    ].join("\n"),
    buttons: ["Open GitHub", "Close"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) await shell.openExternal(GITHUB_PROFILE_URL);
}

/** Help → ICAI Project dialog. */
async function showIcaiProject(parent: BrowserWindow): Promise<void> {
  await dialog.showMessageBox(parent, {
    type: "info",
    title: "ICAI Project",
    message: "TallyMCP Pro",
    detail: [
      "A read-only Model Context Protocol (MCP) server that connects TallyPrime",
      "to AI assistants (Claude, Cursor, LM Studio, Ollama), letting Chartered",
      "Accountants query ledgers and generate Trial Balance, P&L, Balance Sheet,",
      "Day Book and audit-lite reports through natural language.",
      "",
      "Programme: AI ICAI Level II",
      "Batch: 44",
      "Location: Gurugram",
      "Submission Date: 25th Jun 2026",
      "GitHub: github.com/vinaysaraf/tallymcp-pro",
    ].join("\n"),
  });
}

/** Shared fallback: point the user at the website installer. */
async function offerManualDownload(
  parent: BrowserWindow,
  version: string | undefined,
  url: string | undefined,
): Promise<void> {
  const { response } = await dialog.showMessageBox(parent, {
    type: "warning",
    title: "TallyMCP Update",
    message: version
      ? `TallyMCP v${version} couldn't be installed automatically.`
      : "The update couldn't be installed automatically.",
    detail: "You can download and run the latest installer from the website.",
    buttons: ["Download from website", "Close"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) await shell.openExternal(url ?? RELEASES_URL);
}

/**
 * Help → Update flow: check, then (with consent) download + install — with a
 * "download from website" fallback whenever the update can't be applied
 * automatically (e.g. a self-signed build an OLDER installed version still
 * rejects at signature verification).
 */
async function runMenuUpdateFlow(
  parent: BrowserWindow,
  updater: AutoUpdater | undefined,
): Promise<void> {
  if (!updater) {
    await dialog.showMessageBox(parent, {
      type: "info",
      title: "TallyMCP Update",
      message: "Updates run only in the installed app.",
      detail: "This build can't check for updates.",
    });
    return;
  }
  const u = updater;

  const status = await u.checkForUpdates();
  if (status.status === "up-to-date") {
    await dialog.showMessageBox(parent, {
      type: "info",
      title: "TallyMCP Update",
      message: `You're on the latest version (v${status.currentVersion}).`,
    });
    return;
  }
  if (status.status === "error") {
    await offerManualDownload(parent, status.latestVersion, status.releaseNotesUrl);
    return;
  }
  if (status.status !== "update-available") return;

  const choice = await dialog.showMessageBox(parent, {
    type: "info",
    title: "TallyMCP Update",
    message: `TallyMCP v${status.latestVersion} is available.`,
    detail: `You're on v${status.currentVersion}. Download and install it now?`,
    buttons: ["Download & Install", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) return;

  // Drive to a terminal state, then prompt to restart — or fall back to a
  // manual download if the download/verification fails.
  await new Promise<void>((resolve) => {
    const unsub = u.subscribe((s: UpdateStatus) => {
      if (s.status === "ready-to-install") {
        unsub();
        void dialog
          .showMessageBox(parent, {
            type: "info",
            title: "TallyMCP Update",
            message: `TallyMCP v${s.latestVersion} is ready.`,
            detail: "Restart now to finish updating?",
            buttons: ["Restart now", "Later"],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          })
          .then((r) => {
            if (r.response === 0) u.quitAndInstall();
            resolve();
          });
      } else if (s.status === "error") {
        unsub();
        void offerManualDownload(parent, s.latestVersion, s.releaseNotesUrl).then(resolve);
      }
    });
    void u.downloadUpdate();
  });
}

// Lifecycle wiring — guarded so tests can import the file without booting Electron.

// --uninstall-cleanup mode: no Electron window, no IPC; just run the
// cleanup helper and exit. Invoked by the NSIS uninstaller via the
// customUnInstall macro (see installer/installer.nsh).
//
// Wrapped in app.whenReady() so process.env + the app module are fully
// initialized before cleanup runs (avoids a race that yields silent no-op
// cleanup under NSIS ExecWait — see Cursor review H1). Use app.exit(0)
// rather than app.quit() so the process terminates immediately and
// deterministically; app.quit() can hang if there's any pending event
// loop work, which would freeze the NSIS uninstaller indefinitely.
if (process.argv.includes("--uninstall-cleanup")) {
  app.whenReady()
    .then(async () => {
      // Lazy-import so the cleanup path doesn't pull Electron's full UI
      // graph just to read it.
      const { runUninstallCleanup } = await import("./uninstall-cleanup.js");
      const result = await runUninstallCleanup();
      for (const msg of result.messages) {
        console.log(msg);
      }
      console.log(
        `Done. clientsUnwired=${result.clientsUnwired.length}, ` +
          `tallyIniRestored=${result.tallyIniRestored}, ` +
          `firewallRule=${result.firewallRule}`,
      );
      app.exit(0);
    })
    .catch((err) => {
      // runUninstallCleanup is designed not to throw (see its tests), so
      // this catches only catastrophic failures (dynamic import error,
      // Electron init issue, etc.). Exit non-zero so the NSIS uninstaller
      // doesn't wait forever — it ignores the code per installer.nsh and
      // still wipes the install dir, but a clean exit is the contract.
      console.error("[uninstall-cleanup] fatal:", err);
      app.exit(1);
    });
} else if (process.env.NODE_ENV !== "test") {
  app.whenReady().then(async () => {
    const { resolveInstallDir } = await import("./install-dir.js");
    const installDir = resolveInstallDir({
      isPackaged: app.isPackaged,
      exePath: app.getPath("exe"),
      env: process.env,
      homedirPath: homedir(),
    });

    // Register IPC handlers FIRST (before createWindow) so the renderer's
    // mount-time IPC calls (healthCheck, getConfig) find handlers waiting.
    // The auto-updater bootstraps below and registers its 3 channels
    // separately if it succeeds.
    //
    // Earlier Phase 4 drafts attempted a Cursor H3 "single registerIpcHandlers
    // call after the auto-updater is ready" — that broke E2E because the
    // renderer mounts during await createWindow() and its mount-effect
    // healthCheck() raced ahead of the post-updater registration. The
    // current shape: core handlers BEFORE the window, update handlers
    // AFTER the updater (separate function).
    registerIpcHandlers(ipcMain, {
      installDir,
      version: app.getVersion(),
    });

    const mainWindow = await createWindow();
    const poller = createTallyPoller({
      // Resolve the URL each tick from config.json so the status follows a
      // This-PC ↔ Server connection change without restarting the poller.
      url: () => tallyUrlFromConfig(installDir),
      intervalMs: 5_000,
      onStatus: (status) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(TALLY_STATUS_EVENT, status);
        }
      },
    });
    poller.start();

    app.on("before-quit", () => poller.stop());

    // Auto-updater (Phase 4). Wrapped in try/catch because
    // electron-updater's autoUpdater singleton throws when the app is
    // running unpackaged (dev mode, Playwright E2E preview). On failure
    // the renderer's update banner stays hidden — the rest of the app
    // still works because the core IPC handlers were registered above.
    // Declared here (not inside the try) so the Help → Update menu handler
    // below can close over it; stays undefined when the updater can't init.
    let updater: AutoUpdater | undefined;
    try {
      const { createAutoUpdater } = await import("./auto-update.js");
      // Local const so the closures below don't trip on `updater` being a
      // reassignable `let` (TS won't narrow a captured `let` to non-undefined).
      const u = createAutoUpdater({
        currentVersion: app.getVersion(),
        // Captures download/verify failures so a looping update is diagnosable.
        logFile: join(app.getPath("userData"), "logs", "updater.log"),
      });
      updater = u;

      const unsubUpdate = u.subscribe((status) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(UPDATE_STATUS_EVENT, status);
        }
      });
      app.on("before-quit", () => unsubUpdate());

      // Register the 3 update IPC channels. These are separate from the
      // core registerIpcHandlers call because they depend on the updater
      // (which may not initialize in dev/E2E). Use IPC_CHANNELS.* so a
      // rename of the channel-string constant updates the handler too
      // (Cursor N-P4-2).
      ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, () => u.checkForUpdates());
      ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, () => u.downloadUpdate());
      ipcMain.handle(IPC_CHANNELS.QUIT_AND_INSTALL, () => { u.quitAndInstall(); });

      // Initial update check 5 seconds after window opens.
      setTimeout(() => {
        void u.checkForUpdates().catch((err) => {
          console.error("[auto-update] initial check failed:", err);
        });
      }, 5_000);
    } catch (err) {
      console.warn(
        "[auto-update] disabled (likely unpackaged dev/E2E):",
        (err as Error).message,
      );
    }

    // Application menu — adds Help → Update / About Me / ICAI Project. Built
    // after the updater so the Update action can drive it (with a manual
    // download fallback when the updater isn't available or can't verify).
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        createAppMenuTemplate({
          onUpdate: () => void runMenuUpdateFlow(mainWindow, updater),
          onAboutMe: () => void showAboutMe(mainWindow),
          onIcaiProject: () => void showIcaiProject(mainWindow),
        }),
      ),
    );

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
