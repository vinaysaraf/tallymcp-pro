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
if (process.env.NODE_ENV !== "test") {
  app.whenReady().then(async () => {
    const installDir = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "TallyMCP")
      : join(homedir(), "AppData", "Local", "TallyMCP");
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
