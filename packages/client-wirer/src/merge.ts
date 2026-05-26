import type { McpServerEntry } from "./types.js";

const ENTRY_KEY = "tallymcp-pro" as const;

interface ConfigWithServers {
  [k: string]: unknown;
}

/**
 * Adds/updates `{[serversKey]: {tallymcp-pro: entry}}` on the existing config.
 * Other keys preserved by reference.
 */
export function mergeUnderKey(
  existing: ConfigWithServers,
  serversKey: string,
  entry: McpServerEntry,
): ConfigWithServers {
  const currentServers = (existing[serversKey] as Record<string, McpServerEntry> | undefined) ?? {};
  return {
    ...existing,
    [serversKey]: { ...currentServers, [ENTRY_KEY]: entry },
  };
}

/**
 * Removes `[serversKey][tallymcp-pro]` if present. Returns the input unchanged
 * (by reference) if the key wasn't there.
 */
export function removeUnderKey(
  existing: ConfigWithServers,
  serversKey: string,
): ConfigWithServers {
  const currentServers = existing[serversKey] as Record<string, McpServerEntry> | undefined;
  if (!currentServers || !(ENTRY_KEY in currentServers)) return existing;
  const { [ENTRY_KEY]: _removed, ...rest } = currentServers;
  return { ...existing, [serversKey]: rest };
}

// Convenience wrappers for the common "mcpServers" case, kept for back-compat
// with tests that exercise the pure functions directly.
export const mergeMcpServers = (
  existing: ConfigWithServers,
  entry: McpServerEntry,
): ConfigWithServers => mergeUnderKey(existing, "mcpServers", entry);

export const removeMcpServer = (existing: ConfigWithServers): ConfigWithServers =>
  removeUnderKey(existing, "mcpServers");
