import { join } from "node:path";
import { ClientWirer, type ClientId, type McpServerEntry, type WireResult } from "@tallymcp/client-wirer";

export interface RunWireOptions {
  clientId: ClientId;
  /** The TallyMCP install directory (where node.exe + mcp-server live). */
  installDir: string;
  /** Environment for resolving the AI client's config path. Defaults to process.env. */
  env?: Record<string, string | undefined>;
}

export async function runWireCommand(opts: RunWireOptions): Promise<WireResult> {
  const entry: McpServerEntry = {
    command: join(opts.installDir, "node.exe"),
    args: [join(opts.installDir, "mcp-server", "main.js")],
    env: { TALLYMCP_CONFIG: join(opts.installDir, "config.json") },
  };
  const wirer = new ClientWirer({ env: opts.env ?? process.env, entry });
  return wirer.add(opts.clientId);
}
