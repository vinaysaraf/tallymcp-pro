#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { createContext } from "./context.js";
import { registerTallyMcp } from "./server.js";

async function main(): Promise<void> {
  const configPath =
    process.env.TALLYMCP_CONFIG ??
    join(homedir(), ".tallymcp", "config.json");

  const ctx = await createContext({ configPath });

  const server = new McpServer(
    { name: "tallymcp-pro", version: "0.0.1" },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
    },
  );

  registerTallyMcp(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The server now runs until the transport closes.
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // stderr-only — stdout is the JSON-RPC channel.
  console.error(`[tallymcp-server] fatal: ${message}`);
  process.exit(1);
});
