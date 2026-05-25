import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClientId, McpServerEntry, WireResult, UnwireResult } from "./types.js";
import { CLIENT_REGISTRY, resolveClientConfigPath } from "./clients.js";
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
 * Orchestrates wiring and unwiring TallyMCP into AI client configuration files.
 *
 * For each supported client (Claude Desktop, Cursor, Claude Code, LM Studio,
 * Ollama bridge), `add()` performs:
 *
 * 1. Read the existing config file (or treat as empty if absent)
 * 2. Decide action vs current state: added / updated / noop
 * 3. Back up the file on first modification (idempotent — preserves .bak)
 * 4. Merge our entry under `{serversKey}["tallymcp-pro"]`
 * 5. Atomically write via `<file>.tmp` + fsync + rename
 * 6. Verify by reading back and confirming the entry is present
 *
 * `remove()` does the inverse: surgical removal of our key only, leaving
 * sibling servers and top-level keys untouched.
 *
 * The config path and environment variables are resolved at runtime from
 * `CLIENT_REGISTRY` and the supplied `env` map (usually `process.env`).
 * Each client specifies its own `serversKey` ("mcpServers" for most clients,
 * "servers" for Ollama), so this class is fully key-agnostic.
 *
 * @example
 * const wirer = new ClientWirer({
 *   env: process.env,
 *   entry: { command: "node.exe", args: ["main.js"], env: {...} }
 * });
 * const result = await wirer.add("claude-desktop");
 * // result.action: "added" | "updated" | "noop"
 */
export class ClientWirer {
  constructor(private readonly opts: ClientWirerOptions) {}

  async add(clientId: ClientId): Promise<WireResult> {
    const configPath = resolveClientConfigPath(clientId, this.opts.env);
    const serversKey = CLIENT_REGISTRY[clientId].serversKey;

    // 1. Read existing (or treat as {} if absent).
    const existing = await this.readJsonOrEmpty(configPath, serversKey);

    // 2. Decide action vs current state.
    const existingServers = existing[serversKey] as Record<string, McpServerEntry> | undefined;
    const currentEntry = existingServers?.[KEY];

    let action: WireResult["action"];
    if (!currentEntry) action = "added";
    else if (deepEqual(currentEntry, this.opts.entry)) action = "noop";
    else action = "updated";

    if (action === "noop") {
      return { clientId, configPath, backupCreated: false, action };
    }

    // 3. Backup if first time.
    const { created: backupCreated } = await backupIfMissing(configPath);

    // 4. Merge under the client-specific key.
    const merged = mergeUnderKey(existing, serversKey, this.opts.entry);

    // 5. Atomic write — ensure parent dir exists.
    await mkdir(dirname(configPath), { recursive: true });
    await writeAtomic(configPath, JSON.stringify(merged, null, 2) + "\n");

    // 6. Verify by reading back.
    const verify = await this.readJsonOrEmpty(configPath);
    const verifyServers = verify[serversKey] as Record<string, McpServerEntry> | undefined;
    if (!deepEqual(verifyServers?.[KEY], this.opts.entry)) {
      throw new Error(`Verify failed after writing ${configPath}`);
    }

    return { clientId, configPath, backupCreated, action };
  }

  async remove(clientId: ClientId): Promise<UnwireResult> {
    const configPath = resolveClientConfigPath(clientId, this.opts.env);
    const serversKey = CLIENT_REGISTRY[clientId].serversKey;
    const existing = await this.readJsonOrEmpty(configPath, serversKey);
    const currentServers = existing[serversKey] as Record<string, McpServerEntry> | undefined;
    if (!currentServers?.[KEY]) {
      return { clientId, configPath, action: "noop" };
    }
    // Backup before remove, matching "backup-before-write everywhere" spec.
    await backupIfMissing(configPath);
    const stripped = removeUnderKey(existing, serversKey);
    await mkdir(dirname(configPath), { recursive: true });
    await writeAtomic(configPath, JSON.stringify(stripped, null, 2) + "\n");
    return { clientId, configPath, action: "removed" };
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
    // Guard: top-level must be a plain object.
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
    // Guard: if serversKey is present in the file, it must be a plain object.
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
