import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { createTallyPoller } from "./tally-poller.js";
import { TALLY_STATUS_EVENT } from "../shared/ipc-types.js";

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
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
