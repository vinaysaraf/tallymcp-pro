import { mkdir, readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ClientId,
  McpServerEntry,
  WireResult,
  UnwireResult,
  ClientConfigVariant,
} from "./types.js";
import { CLIENT_REGISTRY, resolveClientConfigPath } from "./clients.js";
import {
  resolveClaudeDesktopConfigPaths,
  type ClaudeDesktopConfigPath,
} from "./claude-desktop-paths.js";
import { backupIfMissing } from "./backup.js";
import { writeAtomic } from "./atomic-write.js";
import { mergeUnderKey, removeUnderKey } from "./merge.js";

export interface ClientWirerOptions {
  /** Environment for path expansion. Pass `process.env` in production. */
  env: Record<string, string | undefined>;
  /** The MCP server entry we wire under the `tallymcp-pro` key. */
  entry: McpServerEntry;
}

const KEY = "tallymcp-pro" as const;

/**
 * Returns every applicable config-path for a client. For `claude-desktop`
 * this dispatches to `resolveClaudeDesktopConfigPaths` (which handles MSIX
 * vs standard). For all other clients it returns a single-element array.
 */
function resolvePathsForClient(
  clientId: ClientId,
  env: Record<string, string | undefined>,
): ClaudeDesktopConfigPath[] {
  if (clientId === "claude-desktop") {
    return resolveClaudeDesktopConfigPaths(env, { existsSync, readdirSync });
  }
  return [{ path: resolveClientConfigPath(clientId, env), variant: "standard" }];
}

/**
 * Orchestrates wiring and unwiring TallyMCP into AI client configuration files.
 *
 * For each supported client (Claude Desktop, Cursor, Claude Code, LM Studio,
 * Ollama bridge), `add()` performs (per resolved config path):
 *
 * 1. Read the existing config file (or treat as empty if absent)
 * 2. Decide action vs current state: added / updated / noop
 * 3. Back up the file on first modification (idempotent — preserves .bak)
 * 4. Merge our entry under `{serversKey}["tallymcp-pro"]`
 * 5. Atomically write via `<file>.tmp` + fsync + rename
 * 6. Verify by reading back and confirming the entry is present
 *
 * v1.0.3 (#140): Claude Desktop ships in two flavors on Windows — standalone
 * and Microsoft Store (MSIX/AppContainer-sandboxed). When BOTH are detected,
 * `add()` writes to BOTH config paths. The returned `WireResult.configPaths`
 * + `variants` lets the UI tell the user about all updated locations.
 *
 * `remove()` does the inverse: surgical removal of our key from every path.
 *
 * @example
 * const wirer = new ClientWirer({
 *   env: process.env,
 *   entry: { command: "node.exe", args: ["main.js"], env: {...} }
 * });
 * const result = await wirer.add("claude-desktop");
 * // result.action: "added" | "updated" | "noop"
 * // result.configPaths: ["C:\\...\\Roaming\\Claude\\...", "C:\\...\\Packages\\Claude_xxx\\..."]
 * // result.variants: ["standard", "msix"]
 */
export class ClientWirer {
  constructor(private readonly opts: ClientWirerOptions) {}

  async add(clientId: ClientId): Promise<WireResult> {
    const paths = resolvePathsForClient(clientId, this.opts.env);
    const serversKey = CLIENT_REGISTRY[clientId].serversKey;

    // NOTE (#140 v1.0.3): paths are written sequentially; if path[N] throws
    // after path[0..N-1] succeeded, the earlier paths remain wired and the
    // exception propagates. We do NOT roll back partial writes — the `.bak`
    // files from `backupIfMissing` still exist, so manual recovery is
    // possible. Acceptable for v1.0.3 given how rare a partial fs failure
    // is on Windows for two adjacent JSON file writes. Revisit in v1.0.4
    // if real-world reports surface mid-write failures.
    const writtenPaths: string[] = [];
    const writtenVariants: ClientConfigVariant[] = [];
    let backupCreated = false;
    // Combined action across all paths: "added" if at least one was added,
    // "updated" if at least one was updated, "noop" if all were noops.
    let actionRank = 0; // 0=noop, 1=updated, 2=added

    for (const { path: configPath, variant } of paths) {
      const existing = await this.readJsonOrEmpty(configPath, serversKey);
      const existingServers = existing[serversKey] as Record<string, McpServerEntry> | undefined;
      const currentEntry = existingServers?.[KEY];

      let pathAction: "added" | "updated" | "noop";
      if (!currentEntry) pathAction = "added";
      else if (deepEqual(currentEntry, this.opts.entry)) pathAction = "noop";
      else pathAction = "updated";

      writtenPaths.push(configPath);
      writtenVariants.push(variant);

      if (pathAction === "noop") {
        continue; // Skip the actual write, but the path still counts as "touched".
      }

      const { created } = await backupIfMissing(configPath);
      if (created) backupCreated = true;

      const merged = mergeUnderKey(existing, serversKey, this.opts.entry);
      await mkdir(dirname(configPath), { recursive: true });
      await writeAtomic(configPath, JSON.stringify(merged, null, 2) + "\n");

      // Verify
      const verify = await this.readJsonOrEmpty(configPath);
      const verifyServers = verify[serversKey] as Record<string, McpServerEntry> | undefined;
      if (!deepEqual(verifyServers?.[KEY], this.opts.entry)) {
        throw new Error(`Verify failed after writing ${configPath}`);
      }

      if (pathAction === "added") actionRank = Math.max(actionRank, 2);
      else if (pathAction === "updated") actionRank = Math.max(actionRank, 1);
    }

    const action: WireResult["action"] =
      actionRank === 2 ? "added" : actionRank === 1 ? "updated" : "noop";

    return {
      clientId,
      configPath: writtenPaths[0]!,
      configPaths: writtenPaths,
      variants: writtenVariants,
      backupCreated,
      action,
    };
  }

  async remove(clientId: ClientId): Promise<UnwireResult> {
    const paths = resolvePathsForClient(clientId, this.opts.env);
    const serversKey = CLIENT_REGISTRY[clientId].serversKey;
    const touchedPaths: string[] = [];
    let anyRemoved = false;

    for (const { path: configPath } of paths) {
      const existing = await this.readJsonOrEmpty(configPath, serversKey);
      const currentServers = existing[serversKey] as Record<string, McpServerEntry> | undefined;
      touchedPaths.push(configPath);
      if (!currentServers?.[KEY]) {
        continue; // noop for this path
      }
      await backupIfMissing(configPath);
      const stripped = removeUnderKey(existing, serversKey);
      await mkdir(dirname(configPath), { recursive: true });
      await writeAtomic(configPath, JSON.stringify(stripped, null, 2) + "\n");
      anyRemoved = true;
    }

    return {
      clientId,
      configPath: touchedPaths[0]!,
      configPaths: touchedPaths,
      action: anyRemoved ? "removed" : "noop",
    };
  }

  private async readJsonOrEmpty(
    path: string,
    serversKey?: string,
  ): Promise<Record<string, unknown>> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Cannot parse ${path} as JSON. Refusing to overwrite. Original error: ${
          (err as Error).message
        }`,
      );
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      const actualType = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
      throw new Error(
        `Cannot use ${path}: expected JSON object at top level, got ${actualType}. Refusing to overwrite.`,
      );
    }
    const record = parsed as Record<string, unknown>;
    if (serversKey !== undefined && record[serversKey] !== undefined) {
      const val = record[serversKey];
      if (
        typeof val !== "object" ||
        val === null ||
        Array.isArray(val)
      ) {
        const actualType = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
        throw new Error(
          `Cannot use ${path}: ${serversKey} expected a plain object, got ${actualType}. Refusing to overwrite.`,
        );
      }
    }
    return record;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
