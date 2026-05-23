/**
 * Snippets users paste into Claude Desktop / Cursor / LM Studio / Ollama to
 * wire this MCP server. Produced by the `tally_export_mcp_config` tool.
 */
import { execPath } from "node:process";

export type SupportedClient = "cursor" | "claude-desktop" | "lm-studio" | "ollama";

export interface McpClientConfigOptions {
  client: SupportedClient;
  /** Absolute path to the built `dist/main.js`. */
  serverEntry: string;
  /** Path to the user's config.json. */
  configPath: string;
  /** Node binary to launch the server. Defaults to the running executable. */
  nodePath?: string;
}

export function exportMcpClientConfig(options: McpClientConfigOptions): {
  client: SupportedClient;
  format: "json" | "markdown";
  content: string;
} {
  const node = options.nodePath ?? execPath;
  const env = { TALLYMCP_CONFIG: options.configPath };
  const snippet = {
    command: node,
    args: [options.serverEntry],
    env,
  };

  if (options.client === "cursor") {
    return {
      client: "cursor",
      format: "json",
      content: JSON.stringify(
        { mcpServers: { "tallymcp-pro": snippet } },
        null,
        2,
      ),
    };
  }
  if (options.client === "claude-desktop") {
    return {
      client: "claude-desktop",
      format: "json",
      content: JSON.stringify(
        { mcpServers: { "tallymcp-pro": snippet } },
        null,
        2,
      ),
    };
  }
  if (options.client === "lm-studio") {
    return {
      client: "lm-studio",
      format: "markdown",
      content: [
        "# LM Studio — TallyMCP Pro",
        "",
        "Add this server to LM Studio's MCP settings (Developer → MCP servers):",
        "",
        "```json",
        JSON.stringify({ "tallymcp-pro": snippet }, null, 2),
        "```",
        "",
        "LM Studio launches the server via stdio and exposes its tools to your local model.",
      ].join("\n"),
    };
  }
  // Ollama — no first-party MCP yet; document the stdio launch command.
  return {
    client: "ollama",
    format: "markdown",
    content: [
      "# Ollama — TallyMCP Pro",
      "",
      "Ollama itself does not yet ship an MCP client. Use a bridge such as `mcp-bridge` or wire",
      "the stdio server into your chat host:",
      "",
      "```bash",
      `${node} ${options.serverEntry}`,
      "```",
      "",
      "Set `TALLYMCP_CONFIG` in the environment:",
      "",
      "```bash",
      `export TALLYMCP_CONFIG="${options.configPath}"`,
      "```",
    ].join("\n"),
  };
}
