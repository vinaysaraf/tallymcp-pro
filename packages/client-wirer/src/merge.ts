import type { McpServerEntry } from "./types.js";

const KEY = "tallymcp-pro" as const;

interface ConfigWithMcpServers {
  mcpServers?: Record<string, McpServerEntry>;
  [other: string]: unknown;
}

/**
 * Returns a NEW object with `mcpServers["tallymcp-pro"] = entry`. Existing
 * keys (other servers, top-level keys) are preserved by reference — we do
 * not deep-clone the rest of the config, which means we never accidentally
 * normalize formatting on data we don't own.
 */
export function mergeMcpServers(
  existing: ConfigWithMcpServers,
  entry: McpServerEntry,
): ConfigWithMcpServers {
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      [KEY]: entry,
    },
  };
}

/**
 * Returns a NEW object with our key removed. Other servers and top-level
 * keys are untouched. If our key wasn't present, the returned object is
 * structurally equal to the input.
 */
export function removeMcpServer(existing: ConfigWithMcpServers): ConfigWithMcpServers {
  if (!existing.mcpServers || !(KEY in existing.mcpServers)) {
    return existing;
  }
  const { [KEY]: _removed, ...rest } = existing.mcpServers;
  return { ...existing, mcpServers: rest };
}
