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
  CHECK_FOR_UPDATES: "check-for-updates",
  DOWNLOAD_UPDATE: "download-update",
  QUIT_AND_INSTALL: "quit-and-install",
} as const;

export const TALLY_STATUS_EVENT = "tally-status" as const;

export const UPDATE_STATUS_EVENT = "update-status" as const;

// Mirror the ClientId from @tallymcp/client-wirer — duplicate here so
// the shared module has zero cross-package imports (preload bundles
// statically; importing Phase 1 packages would pull in fs/node:url etc).
export type ClientId =
  | "claude-desktop"
  | "cursor"
  | "claude-code"
  | "lm-studio"
  | "ollama";

/** Variant tag for Claude Desktop config paths (v1.0.3+ #140). Mirrors the type in @tallymcp/client-wirer to avoid cross-package import in the shared preload-bundled module. */
export type ClientConfigVariant = "standard" | "msix";

export interface WireRequest {
  clientId: ClientId;
  // NOTE: installDir is NOT renderer-supplied. Main resolves the canonical
  // %LOCALAPPDATA%\TallyMCP path at boot and injects it via HandlerContext.
  // Trusting a renderer-supplied path would let DevTools point the wire
  // entry at an arbitrary folder (Cursor review H1, 2026-05-26).
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
  /**
   * True when the Configurator process is running with Administrator
   * privileges. Populated by `handleHealthCheck` via `detectIsElevated`
   * from `@tallymcp/tally-autofix`. Optional for backwards compat (Phase
   * 2/3 tests don't pass this; older renderer code treats `undefined` as
   * "unknown" and shows the Fix button without an admin hint).
   */
  isElevated?: boolean;
  /**
   * Value of "Tally Gateway Server" from tally.ini if set. Indicates a
   * networked Tally client setup (this machine talks to a remote Tally
   * over HTTP for actual data). When set, heavy XML queries forward to
   * the remote host — if unreachable, Tally may hang. Surfaced in the
   * Configurator's HealthCheck as a yellow info card (#129).
   */
  tallyGatewayServer?: string;
  /**
   * Forced edition from config.tally.assumedEdition, if set. Tells the
   * Configurator's HealthCheck which edition row to display without
   * having to round-trip through the MCP server's capability probe.
   * undefined = auto-probe (default).
   */
  tallyEdition?: "silver" | "gold" | "unknown";
  /**
   * Detected Claude Desktop install flavors on this machine (v1.0.3+ #140).
   * Possible values per element: `"standard"` (standalone .exe from
   * claude.ai/download — config at `%APPDATA%\Claude\`), or `"msix"`
   * (Microsoft Store / AppContainer-sandboxed — config at
   * `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`). When
   * `"msix"` is present, the renderer's `AddMcpModal` shows a wire-time
   * caveat that Store-version Claude Desktop may not be able to launch
   * local MCP servers from its sandbox.
   */
  claudeDesktopVariants?: ClientConfigVariant[];
}

export interface TallyFixResponse {
  xmlInterface: "applied" | "noop";
  iniBackupCreated: boolean;
  /**
   * Outcome of the firewall rule add attempt:
   *  - `added` — the rule was successfully created.
   *  - `noop` — the rule already existed.
   *  - `skipped-non-admin` — current process isn't admin, netsh refused.
   *  - `group-policy-blocked` — IT policy disallows firewall changes.
   *    The renderer should open the IT-policy help modal (Phase 3.1 D).
   */
  firewallRule: "added" | "noop" | "skipped-non-admin" | "group-policy-blocked";
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

export interface UpdateStatus {
  /**
   * Discriminator for the update-flow state machine. Renderer renders
   * different UI per state:
   *  - `up-to-date`         — no banner, do nothing.
   *  - `update-available`   — show the blue banner with "Update now · What's new · Later".
   *  - `downloading`        — show a progress bar inside the banner.
   *  - `ready-to-install`   — replace the banner with a "Restart to apply" CTA.
   *  - `error`              — show a quiet error line, do not block normal use.
   */
  status:
    | "up-to-date"
    | "update-available"
    | "downloading"
    | "ready-to-install"
    | "error";
  /** Installed version (always populated, even on error). */
  currentVersion: string;
  /** New version available; populated when `status !== "up-to-date"`. */
  latestVersion?: string;
  /** 0..1; populated only when `status === "downloading"`. */
  downloadProgress?: number;
  /** Release-notes URL; usually the GitHub Release page for `latestVersion`. */
  releaseNotesUrl?: string;
  /** Populated only when `status === "error"`. */
  error?: string;
}

/**
 * The renderer-facing API surface that the preload script exposes via
 * `contextBridge.exposeInMainWorld("tallymcp", ...)`. Defined here in
 * shared/ so renderer test code can reference it without importing
 * the preload module (whose `electron` runtime imports aren't valid
 * in the renderer tsconfig scope).
 */
export interface TallymcpApi {
  wireMcp: (req: WireRequest) => Promise<WireResponse>;
  unwireMcp: (req: UnwireRequest) => Promise<UnwireResponse>;
  healthCheck: () => Promise<HealthCheckResponse>;
  tallyFix: () => Promise<TallyFixResponse>;
  tallyRestore: () => Promise<TallyRestoreResponse>;
  getConfig: () => Promise<ConfigSnapshot>;
  subscribeTallyStatus: (cb: (status: TallyStatus) => void) => () => void;
  /** Trigger an explicit update check. Resolves with the current state. */
  checkForUpdates: () => Promise<UpdateStatus>;
  /**
   * Begin downloading the available update. Returns immediately; progress
   * + completion stream via subscribeUpdateStatus. When `status` flips to
   * `ready-to-install`, call `quitAndInstall()` to actually install.
   */
  downloadUpdate: () => Promise<void>;
  /**
   * Quit the app + install the previously-downloaded update + relaunch.
   * Only valid when `status === "ready-to-install"`. Calling earlier is a
   * no-op (or returns an error — see auto-update.ts).
   */
  quitAndInstall: () => Promise<void>;
  /** Subscribe to update-status events. Returns an unsubscriber. */
  subscribeUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
}

export interface IpcContract {
  [IPC_CHANNELS.WIRE_MCP]: { req: WireRequest; res: WireResponse };
  [IPC_CHANNELS.UNWIRE_MCP]: { req: UnwireRequest; res: UnwireResponse };
  [IPC_CHANNELS.HEALTH_CHECK]: { req: void; res: HealthCheckResponse };
  [IPC_CHANNELS.TALLY_FIX]: { req: void; res: TallyFixResponse };
  [IPC_CHANNELS.TALLY_RESTORE]: { req: void; res: TallyRestoreResponse };
  [IPC_CHANNELS.GET_CONFIG]: { req: void; res: ConfigSnapshot };
  [IPC_CHANNELS.CHECK_FOR_UPDATES]: { req: void; res: UpdateStatus };
  [IPC_CHANNELS.DOWNLOAD_UPDATE]: { req: void; res: void };
  [IPC_CHANNELS.QUIT_AND_INSTALL]: { req: void; res: void };
}
