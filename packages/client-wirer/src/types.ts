import { z } from "zod";

/**
 * The JSON shape every JSON-style MCP client (Claude Desktop, Cursor,
 * Claude Code, LM Studio) expects under `mcpServers["tallymcp-pro"]`.
 */
export const McpServerEntrySchema = z.object({
  command: z.string().min(1, "command must be a non-empty path"),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});
export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;

/** Stable identifier we use across the codebase for each supported client. */
export type ClientId =
  | "claude-desktop"
  | "cursor"
  | "claude-code"
  | "lm-studio"
  | "ollama";

/**
 * Variant tag for Claude Desktop config paths (v1.0.3+). For non–Claude-Desktop
 * clients the array is always `["standard"]`.
 */
export type ClientConfigVariant = "standard" | "msix";

/** Result returned from wire/unwire operations — explicit for UX layer to display. */
export interface WireResult {
  clientId: ClientId;
  /**
   * The PRIMARY config path written (always === configPaths[0]). Kept for
   * back-compat with v1.0.2 consumers and tests that read a singular path.
   */
  configPath: string;
  /**
   * All config paths written. Length > 1 only for Claude Desktop when BOTH
   * standalone (%APPDATA%\Claude) and MSIX/Store (sandboxed) installs are
   * present on the machine — v1.0.3 writes to both so each Claude Desktop
   * process sees TallyMCP regardless of which flavor the user launches.
   */
  configPaths: string[];
  /** Parallel array — `variants[i]` is the flavor of `configPaths[i]`. */
  variants: ClientConfigVariant[];
  backupCreated: boolean;
  /** "added" first time, "updated" when re-wiring, "noop" when already correct. */
  action: "added" | "updated" | "noop";
}

export interface UnwireResult {
  clientId: ClientId;
  /** Primary path (=== configPaths[0]). Kept for back-compat. */
  configPath: string;
  /** All paths the unwire operation touched. */
  configPaths: string[];
  /** "removed" when our key was present in at least one path, "noop" otherwise. */
  action: "removed" | "noop";
}
