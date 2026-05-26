/**
 * Single source of truth for the renderer↔main IPC contract.
 *
 * Imported by:
 *  - main/ipc-handlers.ts    (registers handlers)
 *  - main/tally-poller.ts    (emits TALLY_STATUS_EVENT)
 *  - preload/index.ts        (contextBridge.exposeInMainWorld)
 *  - renderer/api.ts         (typed wrapper around window.tallymcp)
 *  - renderer/store.ts       (subscribes to TALLY_STATUS_EVENT)
 */

export const IPC_CHANNELS = {
  WIRE_MCP: "wire-mcp",
  UNWIRE_MCP: "unwire-mcp",
  HEALTH_CHECK: "health-check",
  TALLY_FIX: "tally-fix",
  TALLY_RESTORE: "tally-restore",
  GET_CONFIG: "get-config",
} as const;

export const TALLY_STATUS_EVENT = "tally-status" as const;

// Mirror the ClientId from @tallymcp/client-wirer — duplicate here so
// the shared module has zero cross-package imports (preload bundles
// statically; importing Phase 1 packages would pull in fs/node:url etc).
export type ClientId =
  | "claude-desktop"
  | "cursor"
  | "claude-code"
  | "lm-studio"
  | "ollama";

export interface WireRequest {
  clientId: ClientId;
  installDir: string;
}

export interface WireResponse {
  clientId: ClientId;
  configPath: string;
  backupCreated: boolean;
  action: "added" | "updated" | "noop";
}

export interface UnwireRequest {
  clientId: ClientId;
}

export interface UnwireResponse {
  clientId: ClientId;
  configPath: string;
  action: "removed" | "noop";
}

export interface HealthCheckResponse {
  tallyInstalled: boolean;
  tallyInstallDir?: string;
  tallyRunning: boolean;
  xmlInterfaceEnabled: boolean;
  firewallRulePresent: boolean;
  /** True when client-wirer entries point at a real install dir we created. */
  configuredClients: ClientId[];
  /** Populated when >1 TallyPrime install was detected. UI should ask user. */
  multipleTallyInstalls?: string[];
}

export interface TallyFixResponse {
  xmlInterface: "applied" | "noop";
  iniBackupCreated: boolean;
  firewallRule: "added" | "noop" | "skipped-non-admin";
}

export interface TallyRestoreResponse {
  iniRestored: boolean;
  firewallRule: "removed" | "noop" | "skipped-non-admin";
}

export interface ConfigSnapshot {
  /** TallyMCP install dir — `node.exe` + `mcp-server\main.js` live here. */
  installDir: string;
  /** Detected Tally folder (or undefined if not detected). */
  tallyInstallDir?: string;
  /** Version string from package.json — surfaced in Settings. */
  version: string;
}

export interface TallyStatus {
  /** True when an HTTP probe to 127.0.0.1:9000 returned 200 within 3 s. */
  reachable: boolean;
  /** Company name if loaded; undefined if reachable but no company. */
  companyName?: string;
  /** Last probe timestamp (epoch ms). */
  probedAt: number;
}

export interface IpcContract {
  [IPC_CHANNELS.WIRE_MCP]: { req: WireRequest; res: WireResponse };
  [IPC_CHANNELS.UNWIRE_MCP]: { req: UnwireRequest; res: UnwireResponse };
  [IPC_CHANNELS.HEALTH_CHECK]: { req: void; res: HealthCheckResponse };
  [IPC_CHANNELS.TALLY_FIX]: { req: void; res: TallyFixResponse };
  [IPC_CHANNELS.TALLY_RESTORE]: { req: void; res: TallyRestoreResponse };
  [IPC_CHANNELS.GET_CONFIG]: { req: void; res: ConfigSnapshot };
}
