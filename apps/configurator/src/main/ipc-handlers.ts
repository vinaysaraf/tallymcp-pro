import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  ClientWirer,
  CLIENT_REGISTRY,
  resolveClientConfigPath,
  type McpServerEntry,
  type ClientId,
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
  type HealthCheckResponse,
  type TallyFixResponse,
  type TallyRestoreResponse,
} from "../shared/ipc-types.js";

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
    // pnpm deploy --prod stages mcp-server with dist/ kept (matches
    // @tallymcp/mcp-server's package.json `main: "./dist/index.js"` /
    // `bin: "./dist/main.js"`). The installer's extraFiles config copies
    // installer/staging/mcp-server → <installDir>\mcp-server\.
    args: [join(ctx.installDir, "mcp-server", "dist", "main.js")],
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
 */
async function detectConfiguredClients(
  env: Record<string, string | undefined>,
): Promise<ClientId[]> {
  const configured: ClientId[] = [];
  for (const id of ALL_CLIENT_IDS) {
    try {
      const configPath = resolveClientConfigPath(id, env);
      let raw = await readFile(configPath, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const serversKey = CLIENT_REGISTRY[id].serversKey;
      const servers = parsed[serversKey] as Record<string, unknown> | undefined;
      if (servers && typeof servers === "object" && "tallymcp-pro" in servers) {
        configured.push(id);
      }
    } catch {
      // ENOENT, malformed JSON, missing keys — all "not configured"
    }
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

  // XML interface
  let xmlInterfaceEnabled = false;
  if (tallyInstall) {
    try {
      const text = await readFile(tallyInstall.iniPath, "utf8");
      const ini = parseTallyIni(text);
      xmlInterfaceEnabled =
        ini.get("Client Server") === "Both" && ini.get("ServerPort") === "9000";
    } catch {
      // Unreadable ini → treat as not enabled
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

  return {
    tallyInstalled,
    tallyInstallDir: tallyInstall?.installDir,
    tallyRunning,
    xmlInterfaceEnabled,
    firewallRulePresent,
    configuredClients,
    multipleTallyInstalls: found.length > 1 ? found.map((i) => i.installDir) : undefined,
    isElevated,
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
  return {
    installDir: ctx.installDir,
    version: ctx.version,
    tallyInstallDir: found[0]?.installDir,
  };
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
  ipcMain.handle(IPC_CHANNELS.HEALTH_CHECK, () => handleHealthCheck());
  ipcMain.handle(IPC_CHANNELS.TALLY_FIX, () => handleTallyFix());
  ipcMain.handle(IPC_CHANNELS.TALLY_RESTORE, () => handleTallyRestore());
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () =>
    handleGetConfig({ installDir: ctx.installDir, version: ctx.version }),
  );
}
