import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import {
  ClientWirer,
  CLIENT_REGISTRY,
  resolveClientConfigPath,
  resolveClaudeDesktopConfigPaths,
  type McpServerEntry,
  type ClientId,
  type ClientConfigVariant,
} from "@tallymcp/client-wirer";
import {
  detectTallyInstall,
  detectTallyRunning,
  firewallRuleExists,
  parseTallyIni,
  RealExecRunner,
  TallyAutofixer,
  detectIsElevated,
  type ExecRunner,
  type TallyInstall,
} from "@tallymcp/tally-autofix";
import {
  IPC_CHANNELS,
  type ConfigSnapshot,
  type WireRequest,
  type WireResponse,
  type UnwireRequest,
  type UnwireResponse,
  type RestoreRequest,
  type RestoreResponse,
  type HealthCheckResponse,
  type TallyFixResponse,
  type TallyRestoreResponse,
  type SetTallyConnectionRequest,
} from "../shared/ipc-types.js";

// ── Tally connection (host/port) read/write ──────────────────────────────────
//
// The MCP server reads its config from <installDir>\config.json (wired via the
// TALLYMCP_CONFIG env var — see handleWireMcp). We read/write that SAME file so
// a user can point the tool at a Tally on this PC or on a server, from the GUI,
// with no manual file editing. Reads/writes are raw JSON (matching the existing
// raw config read in handleHealthCheck) and preserve every other config field;
// the MCP server's ConfigStore fills any missing defaults on next load.

type TallyConnectionType = "local" | "lan" | "server";

interface ResolvedTallyConnection {
  host: string;
  port: number;
  type: TallyConnectionType;
}

const DEFAULT_TALLY_CONNECTION: ResolvedTallyConnection = {
  host: "127.0.0.1",
  port: 9000,
  type: "local",
};

function tallyConfigPath(installDir: string): string {
  return join(installDir, "config.json");
}

function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost";
}

// A bare hostname or IPv4 literal — letters, digits, dot, hyphen, underscore.
// Deliberately rejects anything that would change the endpoint when interpolated
// into `http://${host}:${port}`: schemes (`://`), credentials (`@`), paths (`/`),
// query (`?`), fragment (`#`), an embedded port or IPv6 (`:`), and whitespace.
// This keeps the validated host:port the ACTUAL endpoint Tally traffic reaches
// (a raw host like "tally-server/x" or "host:9001" would otherwise silently
// redirect the request). IPv6 literals would need bracketing in the URL, so they
// are rejected here rather than producing a malformed URL. (Codex review iter-1.)
const TALLY_HOST_RE = /^[A-Za-z0-9._-]+$/;

function isValidTallyHost(host: string): boolean {
  return host.length > 0 && host.length <= 253 && TALLY_HOST_RE.test(host);
}

/** Reads the configured (default) Tally connection, or sensible defaults. */
export async function readTallyConnection(installDir: string): Promise<ResolvedTallyConnection> {
  try {
    const raw = await readFile(tallyConfigPath(installDir), "utf8");
    const cfg = JSON.parse(raw) as { tally?: { connections?: unknown } };
    const conns = cfg.tally?.connections;
    if (Array.isArray(conns) && conns.length > 0) {
      const c =
        (conns.find((x) => (x as { default?: boolean }).default) as Record<string, unknown>) ??
        (conns[0] as Record<string, unknown>);
      const host = typeof c.host === "string" && c.host.trim() ? c.host : DEFAULT_TALLY_CONNECTION.host;
      const port = Number.isInteger(c.port) ? (c.port as number) : DEFAULT_TALLY_CONNECTION.port;
      const type: TallyConnectionType =
        c.type === "server" || c.type === "lan" || c.type === "local"
          ? c.type
          : isLoopbackHost(host)
            ? "local"
            : "server";
      return { host, port, type };
    }
  } catch {
    // Missing or malformed config — fall through to defaults.
  }
  return { ...DEFAULT_TALLY_CONNECTION };
}

/** `http://host:port` for the Configurator's status poller. */
export async function tallyUrlFromConfig(installDir: string): Promise<string> {
  const { host, port } = await readTallyConnection(installDir);
  return `http://${host}:${port}`;
}

/**
 * Persists the Tally connection as the single default connection, preserving
 * all other config fields. Validates input at the boundary (Zod-equivalent:
 * non-empty host, port 1..65535) and throws a plain-English error otherwise.
 */
export async function writeTallyConnection(
  installDir: string,
  host: string,
  port: number,
): Promise<ResolvedTallyConnection> {
  const trimmedHost = host.trim();
  if (!trimmedHost) {
    throw new Error("Tally host can't be empty. Use 127.0.0.1 for this PC, or the server's IP/hostname.");
  }
  if (!isValidTallyHost(trimmedHost)) {
    throw new Error(
      `"${trimmedHost}" isn't a valid Tally host. Enter just a hostname or IPv4 address ` +
        `(e.g. 192.168.1.50 or tally-server) — no "http://", no slashes, and put the port in the Port field. ` +
        `IPv6 addresses aren't supported yet.`,
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Tally port must be a whole number between 1 and 65535 (got "${port}"). The Tally default is 9000.`);
  }
  const path = tallyConfigPath(installDir);
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) cfg = {};
  } catch {
    cfg = {};
  }
  if (typeof cfg.schemaVersion !== "number") cfg.schemaVersion = 1;
  const type: TallyConnectionType = isLoopbackHost(trimmedHost) ? "local" : "server";
  const tally =
    cfg.tally && typeof cfg.tally === "object" && !Array.isArray(cfg.tally)
      ? (cfg.tally as Record<string, unknown>)
      : {};
  tally.connections = [{ host: trimmedHost, port, type, default: true }];
  cfg.tally = tally;
  await writeFile(path, JSON.stringify(cfg, null, 2), "utf8");
  return { host: trimmedHost, port, type };
}

/**
 * Test injection point — production callers pass `installDir` (resolved
 * by main at boot from %LOCALAPPDATA%\TallyMCP); tests inject a synthetic
 * env so we don't touch real %APPDATA% during unit tests.
 *
 * `installDir` is in the CONTEXT, not the request, because it must come
 * from main — never from the renderer (Cursor review H1).
 */
export interface HandlerContext {
  env?: Record<string, string | undefined>;
}

export interface WireMcpContext extends HandlerContext {
  installDir: string;
}

export async function handleWireMcp(
  req: WireRequest,
  ctx: WireMcpContext,
): Promise<WireResponse> {
  const entry: McpServerEntry = {
    command: join(ctx.installDir, "node.exe"),
    // v1.0.5+ (#152): mcp-server now ships as a single esbuild bundle
    // (main.bundle.js) directly under <installDir>/mcp-server/. No
    // dist/ subdir, no node_modules. The previous "mcp-server/dist/main.js"
    // path was for the pnpm-deploy layout that broke on Windows NSIS extraction.
    args: [join(ctx.installDir, "mcp-server", "main.bundle.js")],
    env: { TALLYMCP_CONFIG: join(ctx.installDir, "config.json") },
  };
  const wirer = new ClientWirer({ env: ctx.env ?? process.env, entry });
  return wirer.add(req.clientId);
}

export async function handleUnwireMcp(
  req: UnwireRequest,
  ctx: HandlerContext = {},
): Promise<UnwireResponse> {
  // remove() doesn't need a real entry — pass a stub.
  const wirer = new ClientWirer({
    env: ctx.env ?? process.env,
    entry: { command: "(unused-for-remove)", args: [] },
  });
  return wirer.remove(req.clientId);
}

export async function handleRestoreMcp(
  req: RestoreRequest,
  ctx: HandlerContext = {},
): Promise<RestoreResponse> {
  // restore() doesn't need a real entry — pass a stub.
  const wirer = new ClientWirer({
    env: ctx.env ?? process.env,
    entry: { command: "(unused-for-restore)", args: [] },
  });
  const result = await wirer.restore(req.clientId);
  return {
    clientId: result.clientId,
    configPath: result.configPath,
    configPaths: result.configPaths,
    action: result.action,
    restoredFromISO: result.restoredFromISO,
  };
}

/**
 * Returns the clients that have at least one restorable backup on disk. Used by
 * the home screen to offer "Reset config" even when a client's live config was
 * wiped/corrupted (so it isn't in `configuredClients`).
 */
async function detectRestorableClients(
  env: Record<string, string | undefined>,
): Promise<ClientId[]> {
  // entry is unused by hasBackups() — pass a stub (same pattern as unwire/restore).
  const wirer = new ClientWirer({ env, entry: { command: "(unused-for-probe)", args: [] } });
  const out: ClientId[] = [];
  for (const id of ALL_CLIENT_IDS) {
    try {
      if (await wirer.hasBackups(id)) out.push(id);
    } catch {
      // Missing env var (e.g. USERPROFILE) — treat as "no backups".
    }
  }
  return out;
}

export interface HealthCheckContext {
  /** Override scan roots (default: Program Files + Program Files (x86)). */
  scanRoots?: string[];
  /** Override the exec runner (default: RealExecRunner). */
  runner?: ExecRunner;
  /** Override the environment variables used to resolve client config paths (default: process.env). */
  env?: Record<string, string | undefined>;
}

const ALL_CLIENT_IDS: ClientId[] = [
  "claude-desktop",
  "cursor",
  "claude-code",
  "lm-studio",
  "ollama",
];

/**
 * Returns the subset of client IDs whose config files contain a
 * "tallymcp-pro" entry under the registry's serversKey. Missing files,
 * unreadable JSON, and missing keys all count as "not configured".
 * Strips a UTF-8 BOM before parse (matches client-wirer's behavior).
 *
 * For claude-desktop, ALL applicable paths (standard + MSIX) are probed —
 * any match counts as configured (#140).
 */
async function detectConfiguredClients(
  env: Record<string, string | undefined>,
): Promise<ClientId[]> {
  const configured: ClientId[] = [];
  for (const id of ALL_CLIENT_IDS) {
    // For claude-desktop, probe ALL applicable paths (standard + MSIX).
    // For other clients, the single-path resolver from clients.ts applies.
    // resolveClientConfigPath may throw if a required env var is absent
    // (e.g. USERPROFILE) — treat that the same as "not configured".
    let probePaths: string[];
    try {
      probePaths =
        id === "claude-desktop"
          ? resolveClaudeDesktopConfigPaths(env, { existsSync, readdirSync }).map(
              (p) => p.path,
            )
          : [resolveClientConfigPath(id, env)];
    } catch {
      // Missing env var — skip this client
      continue;
    }
    const serversKey = CLIENT_REGISTRY[id].serversKey;
    let found = false;
    for (const configPath of probePaths) {
      try {
        let raw = await readFile(configPath, "utf8");
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const servers = parsed[serversKey] as Record<string, unknown> | undefined;
        if (servers && typeof servers === "object" && "tallymcp-pro" in servers) {
          found = true;
          break;
        }
      } catch {
        // ENOENT, malformed JSON, missing keys — try next probe path
      }
    }
    if (found) configured.push(id);
  }
  return configured;
}

export async function handleHealthCheck(
  ctx: HealthCheckContext = {},
): Promise<HealthCheckResponse> {
  const runner = ctx.runner ?? new RealExecRunner();

  // Tally install
  const found = (await detectTallyInstall({
    scanRoots: ctx.scanRoots,
    returnAll: true,
  })) as TallyInstall[];
  const tallyInstall = found[0];
  const tallyInstalled = found.length > 0;

  // Tally running
  const tallyRunning = tallyInstalled ? await detectTallyRunning(runner) : false;

  // XML interface + Tally Gateway Server (#129)
  let xmlInterfaceEnabled = false;
  let tallyGatewayServer: string | undefined;
  if (tallyInstall) {
    try {
      const text = await readFile(tallyInstall.iniPath, "utf8");
      const ini = parseTallyIni(text);
      xmlInterfaceEnabled =
        ini.get("Client Server") === "Both" && ini.get("ServerPort") === "9000";
      // Parse "Tally Gateway Server" — tolerates whitespace + case variations.
      const gwMatch = /^\s*tally\s+gateway\s+server\s*=\s*(.+?)\s*$/im.exec(text);
      if (gwMatch) {
        tallyGatewayServer = gwMatch[1];
      }
    } catch {
      // Unreadable ini — treat as not enabled
    }
  }

  // tallyEdition — read from config.json if available (#129).
  // Uses a simple try/catch + JSON.parse; config-store's full validation
  // isn't needed for this read-only display purpose. In test environments
  // TALLYMCP_CONFIG is not set, so tallyEdition will be undefined (expected
  // behaviour — tests only assert on gateway, not edition).
  let tallyEdition: "silver" | "gold" | "unknown" | undefined;
  const configFilePath = (ctx.env ?? process.env)["TALLYMCP_CONFIG"];
  if (configFilePath) {
    try {
      const raw = await readFile(configFilePath, "utf8");
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      const tally = cfg["tally"] as Record<string, unknown> | undefined;
      const assumed = tally?.["assumedEdition"];
      if (assumed === "silver" || assumed === "gold" || assumed === "unknown") {
        tallyEdition = assumed;
      }
    } catch {
      // Missing or malformed config — leave tallyEdition undefined
    }
  }

  // Firewall
  const firewallRulePresent = await firewallRuleExists(runner);

  // Elevation pre-flight (Phase 3.1 Patch C)
  const isElevated = await detectIsElevated(runner);

  // Configured clients — probe each client config file for "tallymcp-pro"
  const configuredClients = await detectConfiguredClients(
    ctx.env ?? process.env,
  );

  // Restorable clients — those with a backup on disk, even if the live config
  // was wiped/corrupted (so they're NOT in configuredClients). Lets the home
  // screen still offer "Reset config" in the recovery case.
  const restorableClients = await detectRestorableClients(ctx.env ?? process.env);

  // claudeDesktopVariants — used by AddMcpModal (Task 7) to show an MSIX
  // wire-time warning before the user clicks "Add MCP". If a Store-version
  // Claude Desktop is detected, we surface the AppContainer caveat upfront
  // instead of waiting for DoneScreen.
  //
  // The resolver throws when APPDATA is missing from the environment. That's
  // expected on Linux CI (and possible in unusual Windows launch contexts).
  // We treat any throw here as "no Claude Desktop detected" — the variant
  // array stays empty, AddMcpModal's MSIX warning won't render, and the
  // wire path (which gets its own env at IPC time) is unaffected.
  let claudeDesktopVariants: ClientConfigVariant[] = [];
  try {
    claudeDesktopVariants = resolveClaudeDesktopConfigPaths(
      ctx.env ?? process.env,
      { existsSync, readdirSync },
    ).map((p) => p.variant);
  } catch {
    // APPDATA missing or another resolver-side failure — leave as [].
  }

  return {
    tallyInstalled,
    tallyInstallDir: tallyInstall?.installDir,
    tallyRunning,
    xmlInterfaceEnabled,
    firewallRulePresent,
    configuredClients,
    restorableClients,
    multipleTallyInstalls: found.length > 1 ? found.map((i) => i.installDir) : undefined,
    isElevated,
    tallyGatewayServer,
    tallyEdition,
    claudeDesktopVariants,
  };
}

export interface TallyOpContext {
  scanRoots?: string[];
  runner?: ExecRunner;
}

async function resolveSingleInstall(
  ctx: TallyOpContext,
): Promise<TallyInstall> {
  const found = (await detectTallyInstall({
    scanRoots: ctx.scanRoots,
    returnAll: true,
  })) as TallyInstall[];
  if (found.length === 0) {
    throw new Error("TallyPrime is not installed. Install it from https://tallysolutions.com");
  }
  if (found.length > 1) {
    const list = found.map((i) => `  - ${i.installDir}`).join("\n");
    throw new Error(`Multiple TallyPrime installs found:\n${list}`);
  }
  return found[0]!;
}

export async function handleTallyFix(
  ctx: TallyOpContext = {},
): Promise<TallyFixResponse> {
  const runner = ctx.runner ?? new RealExecRunner();
  const install = await resolveSingleInstall(ctx);
  const fixer = new TallyAutofixer({ runner });
  const xml = await fixer.fixXmlInterface(install);
  const firewallRule = await fixer.ensureFirewallRule(install.exePath);
  return {
    xmlInterface: xml.action,
    iniBackupCreated: xml.iniBackupCreated,
    firewallRule,
  };
}

export async function handleTallyRestore(
  ctx: TallyOpContext = {},
): Promise<TallyRestoreResponse> {
  const runner = ctx.runner ?? new RealExecRunner();
  const install = await resolveSingleInstall(ctx);
  const fixer = new TallyAutofixer({ runner });
  await fixer.restoreTallyIni(install.iniPath);
  const firewallRule = await fixer.removeFirewallRuleIfPresent();
  return { iniRestored: true, firewallRule };
}

export interface GetConfigContext {
  installDir: string;
  version: string;
  scanRoots?: string[];
}

export async function handleGetConfig(
  ctx: GetConfigContext,
): Promise<ConfigSnapshot> {
  const found = (await detectTallyInstall({
    scanRoots: ctx.scanRoots,
    returnAll: true,
  })) as TallyInstall[];
  const conn = await readTallyConnection(ctx.installDir);
  return {
    installDir: ctx.installDir,
    version: ctx.version,
    tallyInstallDir: found[0]?.installDir,
    tallyHost: conn.host,
    tallyPort: conn.port,
    tallyConnectionType: conn.type,
  };
}

export interface SetTallyConnectionContext {
  installDir: string;
  version: string;
  scanRoots?: string[];
}

export async function handleSetTallyConnection(
  req: SetTallyConnectionRequest,
  ctx: SetTallyConnectionContext,
): Promise<ConfigSnapshot> {
  await writeTallyConnection(ctx.installDir, req.host, req.port);
  // Return a fresh snapshot so the renderer reflects the persisted values.
  return handleGetConfig({
    installDir: ctx.installDir,
    version: ctx.version,
    scanRoots: ctx.scanRoots,
  });
}

export interface RegisterContext {
  installDir: string;
  version: string;
}

/**
 * Registers IPC handlers on the supplied ipcMain. Called once at Electron
 * `app.ready` BEFORE `createWindow()` so the renderer's mount-time IPC
 * calls (healthCheck, getConfig) find handlers waiting. Tests invoke the
 * `handle*` functions directly.
 *
 * Phase 4's three update channels (check-for-updates, download-update,
 * quit-and-install) are registered SEPARATELY inline in `main/index.ts`
 * AFTER the auto-updater bootstraps. This split is intentional: the
 * core IPCs must be ready before the renderer mounts, but the updater
 * may not initialize in unpackaged dev / Playwright E2E preview mode.
 */
export function registerIpcHandlers(
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => void },
  ctx: RegisterContext,
): void {
  ipcMain.handle(IPC_CHANNELS.WIRE_MCP, (_evt, payload) =>
    handleWireMcp(payload as WireRequest, { installDir: ctx.installDir }),
  );
  ipcMain.handle(IPC_CHANNELS.UNWIRE_MCP, (_evt, payload) => handleUnwireMcp(payload as UnwireRequest));
  ipcMain.handle(IPC_CHANNELS.RESTORE_CONFIG, (_evt, payload) => handleRestoreMcp(payload as RestoreRequest));
  ipcMain.handle(IPC_CHANNELS.HEALTH_CHECK, () => handleHealthCheck());
  ipcMain.handle(IPC_CHANNELS.TALLY_FIX, () => handleTallyFix());
  ipcMain.handle(IPC_CHANNELS.TALLY_RESTORE, () => handleTallyRestore());
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () =>
    handleGetConfig({ installDir: ctx.installDir, version: ctx.version }),
  );
  ipcMain.handle(IPC_CHANNELS.SET_TALLY_CONNECTION, (_evt, payload) =>
    handleSetTallyConnection(payload as SetTallyConnectionRequest, {
      installDir: ctx.installDir,
      version: ctx.version,
    }),
  );
}
