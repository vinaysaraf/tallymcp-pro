import { ConfigStore, type Config, type TallyConnection } from "@tallymcp/config-store";
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { resolveOutputDir } from "@tallymcp/output-store";
import { getCurrentCompany } from "@tallymcp/report-engine";
import {
  fromAssumedEdition,
  probeTallyCapabilities,
  type TallyCapabilities,
} from "./capability.js";
import { createNetworkGuard, type NetworkGuard } from "./network-guard.js";

export interface McpContextOptions {
  /** Path to `config.json`. Created with defaults if missing. */
  configPath: string;
  /** Override the on-disk output folder for generated files. */
  outputDir?: string;
  /** Skip the boot-time capability probe (tests). Forces edition="unknown". */
  skipCapabilityProbe?: boolean;
  /** Inject capabilities directly (tests) — bypasses the probe entirely. */
  capabilitiesOverride?: TallyCapabilities;
}

export interface McpContext {
  config: Config;
  configStore: ConfigStore;
  tallyClient: TallyHttpClient;
  networkGuard: NetworkGuard;
  outputDir: string;
  /** What this Tally instance can actually serve via XML (boot-time probe). */
  capabilities: TallyCapabilities;
  /** Refreshes the Tally client + network guard + capabilities after a config change. */
  refresh(): Promise<void>;
  /**
   * Confirms Tally will serve `company` before any report runs. Tally silently
   * falls back to the active company when the requested one can't be selected,
   * so this refuses to proceed (and leak another company's books) on a
   * definitive mismatch. No-op when the probe can't determine the company.
   */
  assertCompany(company: string): Promise<void>;
}

function pickConnection(config: Config): TallyConnection {
  return (
    config.tally.connections.find((c) => c.default) ??
    config.tally.connections[0] ?? {
      host: "127.0.0.1",
      port: 9000,
      type: "local",
    }
  );
}

function resolveTimeoutMs(config: Config): number {
  const envOverride = process.env["TALLYMCP_TIMEOUT"]
    ? parseInt(process.env["TALLYMCP_TIMEOUT"], 10)
    : NaN;
  if (!isNaN(envOverride) && envOverride > 0) return envOverride;
  return config.tally.requestTimeoutMs;
}

function buildClient(conn: TallyConnection, timeoutMs: number): TallyHttpClient {
  return new TallyHttpClient({
    host: conn.host,
    port: conn.port,
    timeoutMs,
    serialize: true,
  });
}

async function detectCapabilities(
  config: Config,
  client: TallyHttpClient,
  skip: boolean | undefined,
): Promise<TallyCapabilities> {
  if (skip) {
    return {
      reachable: false,
      edition: "unknown",
      reportFormViable: false,
      computedBalancesViable: false,
      detectedAt: new Date().toISOString(),
      message: "Capability probe skipped (test context).",
    };
  }
  const assumed = config.tally.assumedEdition;
  if (assumed === "silver" || assumed === "gold") {
    return fromAssumedEdition(assumed);
  }
  return probeTallyCapabilities(client, { company: config.tally.defaultCompany });
}

export async function createContext(options: McpContextOptions): Promise<McpContext> {
  const configStore = new ConfigStore(options.configPath);
  const config = await configStore.load();
  let conn = pickConnection(config);
  let tallyClient = buildClient(conn, resolveTimeoutMs(config));
  let networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
  let capabilities =
    options.capabilitiesOverride ??
    (await detectCapabilities(config, tallyClient, options.skipCapabilityProbe));
  // Resolve a relative output folder (the default is "./tallymcp-output")
  // against the user's HOME dir, never the spawn CWD — see resolveOutputDir.
  const outputDir = options.outputDir ?? resolveOutputDir(config.output.folder);

  const context: McpContext = {
    get config() {
      return configStore.get();
    },
    configStore,
    get tallyClient() {
      return tallyClient;
    },
    get networkGuard() {
      return networkGuard;
    },
    get capabilities() {
      return capabilities;
    },
    outputDir,
    async refresh() {
      await configStore.load();
      conn = pickConnection(configStore.get());
      tallyClient = buildClient(conn, resolveTimeoutMs(configStore.get()));
      networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
      capabilities =
        options.capabilitiesOverride ??
        (await detectCapabilities(configStore.get(), tallyClient, options.skipCapabilityProbe));
    },
    async assertCompany(company: string) {
      verifyCompanyMatch(company, await getCurrentCompany(tallyClient, company));
    },
  };
  return context;
}

/**
 * Throws when Tally is definitively serving a DIFFERENT company than requested.
 * A blank `actual` (older Tally / transient probe) is a no-op so it never blocks
 * a legitimate request; only a non-empty mismatch is refused. Pure + exported so
 * the safety-critical decision is unit-testable without a live Tally.
 */
export function verifyCompanyMatch(requested: string, actual: string): void {
  if (actual && actual !== requested) {
    throw new Error(
      `TallyPrime served company "${actual}", not "${requested}". The requested company is not the ` +
        `active one and could not be selected, so the data would belong to a different company. ` +
        `Open "${requested}" in TallyPrime (Gateway of Tally → F3: Company), or run tally_list_companies ` +
        `to copy its exact name, then retry.`,
    );
  }
}

/** Returns the config with secrets redacted for safe MCP exposure. */
export function redactConfig(config: Config): Config {
  // No secrets in v0.5 — keychain integration is post-submission. Return as-is.
  return config;
}
