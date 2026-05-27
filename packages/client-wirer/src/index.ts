export { ClientWirer, type ClientWirerOptions } from "./wirer.js";
export { CLIENT_REGISTRY, resolveClientConfigPath, type ClientSpec } from "./clients.js";
export { McpServerEntrySchema } from "./types.js";
export type {
  ClientId,
  McpServerEntry,
  WireResult,
  UnwireResult,
  ClientConfigVariant,
} from "./types.js";
export {
  resolveClaudeDesktopConfigPaths,
  type ClaudeDesktopConfigPath,
  type ClaudeDesktopVariant,
  type PathProbeFs,
} from "./claude-desktop-paths.js";
