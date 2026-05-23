import { ConfigStore, type Config, type TallyConnection } from "@tallymcp/config-store";
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { createNetworkGuard, type NetworkGuard } from "./network-guard.js";

export interface McpContextOptions {
  /** Path to `config.json`. Created with defaults if missing. */
  configPath: string;
  /** Override the on-disk output folder for generated files. */
  outputDir?: string;
}

export interface McpContext {
  config: Config;
  configStore: ConfigStore;
  tallyClient: TallyHttpClient;
  networkGuard: NetworkGuard;
  outputDir: string;
  /** Refreshes the Tally client and network guard after a config change. */
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

export async function createContext(options: McpContextOptions): Promise<McpContext> {
  const configStore = new ConfigStore(options.configPath);
  const config = await configStore.load();
  let conn = pickConnection(config);
  let tallyClient = new TallyHttpClient({
    host: conn.host,
    port: conn.port,
    timeoutMs: 60_000,
    serialize: true,
  });
  let networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
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
    outputDir,
    async refresh() {
      await configStore.load();
      conn = pickConnection(configStore.get());
      tallyClient = new TallyHttpClient({
        host: conn.host,
        port: conn.port,
        timeoutMs: 60_000,
        serialize: true,
      });
      networkGuard = createNetworkGuard({ host: conn.host, port: conn.port });
    },
  };
  return context;
}

/** Returns the config with secrets redacted for safe MCP exposure. */
export function redactConfig(config: Config): Config {
  // No secrets in v0.5 — keychain integration is post-submission. Return as-is.
  return config;
}
