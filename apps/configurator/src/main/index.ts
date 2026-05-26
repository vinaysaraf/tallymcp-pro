import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { createTallyPoller } from "./tally-poller.js";
import { TALLY_STATUS_EVENT, UPDATE_STATUS_EVENT } from "../shared/ipc-types.js";

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
      url: "http://127.0.0.1:9000",
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
    try {
      const { createAutoUpdater } = await import("./auto-update.js");
      const updater = createAutoUpdater({ currentVersion: app.getVersion() });

      const unsubUpdate = updater.subscribe((status) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(UPDATE_STATUS_EVENT, status);
        }
      });
      app.on("before-quit", () => unsubUpdate());

      // Register the 3 update IPC channels. These are separate from the
      // core registerIpcHandlers call because they depend on the updater
      // (which may not initialize in dev/E2E).
      ipcMain.handle("check-for-updates", () => updater.checkForUpdates());
      ipcMain.handle("download-update", () => updater.downloadUpdate());
      ipcMain.handle("quit-and-install", () => { updater.quitAndInstall(); });

      // Initial update check 5 seconds after window opens.
      setTimeout(() => {
        void updater.checkForUpdates().catch((err) => {
          console.error("[auto-update] initial check failed:", err);
        });
      }, 5_000);
    } catch (err) {
      console.warn(
        "[auto-update] disabled (likely unpackaged dev/E2E):",
        (err as Error).message,
      );
    }

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
