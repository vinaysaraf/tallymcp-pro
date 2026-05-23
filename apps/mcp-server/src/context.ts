import { ConfigStore, type Config, type TallyConnection } from "@tallymcp/config-store";
import { TallyHttpClient } from "@tallymcp/tally-connector";
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

function buildClient(conn: TallyConnection): TallyHttpClient {
  return new TallyHttpClient({
    host: conn.host,
    port: conn.port,
    // 15 s body / 10 s headers (defaults from tally-connector). Bumping these
    // further hides hangs more than it fixes them — Silver-class queries that
    // exceed 15 s are exactly what the capability probe gates off.
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
      voucherQueriesViable: false,
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
  let tallyClient = buildClient(conn);
  let networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
  let capabilities = await detectCapabilities(config, tallyClient, options.skipCapabilityProbe);
  const outputDir = options.outputDir ?? config.output.folder;

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
      tallyClient = buildClient(conn);
      networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
      capabilities = await detectCapabilities(
        configStore.get(),
        tallyClient,
        options.skipCapabilityProbe,
      );
    },
  };
  return context;
}

/** Returns the config with secrets redacted for safe MCP exposure. */
export function redactConfig(config: Config): Config {
  // No secrets in v0.5 — keychain integration is post-submission. Return as-is.
  return config;
}
