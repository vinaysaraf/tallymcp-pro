import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  TALLY_STATUS_EVENT,
  UPDATE_STATUS_EVENT,
  type WireResponse,
  type UnwireResponse,
  type HealthCheckResponse,
  type TallyFixResponse,
  type TallyRestoreResponse,
  type ConfigSnapshot,
  type TallyStatus,
  type UpdateStatus,
  type TallymcpApi,
} from "../shared/ipc-types.js";

// Re-export so existing callers can still `import type { TallymcpApi } from "../preload/..."`.
// Canonical location is now shared/ipc-types.ts (no electron runtime coupling).
export type { TallymcpApi } from "../shared/ipc-types.js";

/**
 * Injectable bridge over Electron's ipcRenderer so we can unit-test the
 * API factory without an actual Electron context.
 */
export interface IpcBridge {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, handler: (event: unknown, ...args: unknown[]) => void) => void;
  removeListener?: (channel: string, handler: (...args: unknown[]) => void) => void;
}

export function buildTallymcpApi(bridge: IpcBridge): TallymcpApi {
  return {
    wireMcp: (req) => bridge.invoke(IPC_CHANNELS.WIRE_MCP, req) as Promise<WireResponse>,
    unwireMcp: (req) => bridge.invoke(IPC_CHANNELS.UNWIRE_MCP, req) as Promise<UnwireResponse>,
    healthCheck: () => bridge.invoke(IPC_CHANNELS.HEALTH_CHECK) as Promise<HealthCheckResponse>,
    tallyFix: () => bridge.invoke(IPC_CHANNELS.TALLY_FIX) as Promise<TallyFixResponse>,
    tallyRestore: () => bridge.invoke(IPC_CHANNELS.TALLY_RESTORE) as Promise<TallyRestoreResponse>,
    getConfig: () => bridge.invoke(IPC_CHANNELS.GET_CONFIG) as Promise<ConfigSnapshot>,
    subscribeTallyStatus: (cb) => {
      const handler = (_event: unknown, status: unknown) => cb(status as TallyStatus);
      bridge.on(TALLY_STATUS_EVENT, handler);
      return () => bridge.removeListener?.(TALLY_STATUS_EVENT, handler);
    },
    checkForUpdates: () =>
      bridge.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES) as Promise<UpdateStatus>,
    downloadUpdate: () =>
      bridge.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE) as Promise<void>,
    quitAndInstall: () =>
      bridge.invoke(IPC_CHANNELS.QUIT_AND_INSTALL) as Promise<void>,
    subscribeUpdateStatus: (cb) => {
      const handler = (_event: unknown, status: unknown) => cb(status as UpdateStatus);
      bridge.on(UPDATE_STATUS_EVENT, handler);
      return () => bridge.removeListener?.(UPDATE_STATUS_EVENT, handler);
    },
  };
}

// Production runtime — only fires when this module is loaded by Electron's
// preload, not when imported by tests.
if (typeof contextBridge !== "undefined" && typeof ipcRenderer !== "undefined") {
  const api = buildTallymcpApi({
    invoke: ipcRenderer.invoke.bind(ipcRenderer),
    on: ipcRenderer.on.bind(ipcRenderer),
    removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
  });
  contextBridge.exposeInMainWorld("tallymcp", api);
}
