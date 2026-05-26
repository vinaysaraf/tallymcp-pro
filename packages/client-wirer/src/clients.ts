import { sep } from "node:path";
import type { ClientId } from "./types.js";

export interface ClientSpec {
  displayName: string;
  /** Path template with ${ENV_VAR} placeholders. Resolved at runtime. */
  configPathTemplate: string;
  /** The JSON top-level key under which our entry lives. */
  serversKey: "mcpServers" | "servers";
}

export const CLIENT_REGISTRY: Readonly<Record<ClientId, ClientSpec>> = {
  "claude-desktop": {
    displayName: "Claude Desktop",
    configPathTemplate: "${APPDATA}\\Claude\\claude_desktop_config.json",
    serversKey: "mcpServers",
  },
  "cursor": {
    displayName: "Cursor",
    configPathTemplate: "${USERPROFILE}\\.cursor\\mcp.json",
    serversKey: "mcpServers",
  },
  "claude-code": {
    displayName: "Claude Code",
    configPathTemplate: "${USERPROFILE}\\.claude.json",
    serversKey: "mcpServers",
  },
  "lm-studio": {
    displayName: "LM Studio",
    configPathTemplate: "${USERPROFILE}\\.lmstudio\\mcp.json",
    serversKey: "mcpServers",
  },
  "ollama": {
    displayName: "Ollama",
    configPathTemplate: "${LOCALAPPDATA}\\TallyMCP\\ollama-bridge\\config.json",
    serversKey: "servers",
  },
};

/**
 * Expands ${ENV_VAR} placeholders in the client's config-path template
 * against the supplied environment map. Throws if a required env var is
 * absent — callers should pass `process.env` (the harness will have it).
 *
 * Templates use Windows-style backslash separators because the production
 * target is Windows. We normalize all `\` to the current platform's
 * `path.sep` so the returned path is usable by `fs` APIs on Linux CI
 * (where `\` is a literal filename character, not a separator).
 */
export function resolveClientConfigPath(
  clientId: ClientId,
  env: Record<string, string | undefined>,
): string {
  const template = CLIENT_REGISTRY[clientId].configPathTemplate;
  const expanded = template.replace(/\$\{([A-Z_]+)\}/g, (_, name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Required env var ${name} is not set`);
    return value;
  });
  return expanded.replace(/\\/g, sep);
}
