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

/** Result returned from wire/unwire operations — explicit for UX layer to display. */
export interface WireResult {
  clientId: ClientId;
  configPath: string;
  backupCreated: boolean;
  /** "added" first time, "updated" when re-wiring, "noop" when already correct. */
  action: "added" | "updated" | "noop";
}

export interface UnwireResult {
  clientId: ClientId;
  configPath: string;
  /** "removed" when our key was present, "noop" when it wasn't. */
  action: "removed" | "noop";
}
