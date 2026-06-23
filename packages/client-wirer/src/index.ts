export { ClientWirer, type ClientWirerOptions } from "./wirer.js";
export { CLIENT_REGISTRY, resolveClientConfigPath, type ClientSpec } from "./clients.js";
export { McpServerEntrySchema } from "./types.js";
export type {
  ClientId,
  McpServerEntry,
  WireResult,
  UnwireResult,
  RestoreResult,
  ClientConfigVariant,
} from "./types.js";
export {
  backupTimestamped,
  listBackups,
  restoreLatest,
  MAX_TIMESTAMPED_BACKUPS,
  type BackupInfo,
  type RestoreOutcome,
  type Clock,
} from "./backups.js";
export {
  resolveClaudeDesktopConfigPaths,
  type ClaudeDesktopConfigPath,
  type ClaudeDesktopVariant,
  type PathProbeFs,
} from "./claude-desktop-paths.js";
