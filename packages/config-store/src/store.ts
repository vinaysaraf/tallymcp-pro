import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ConfigSchema, type Config } from "./schema.js";

/**
 * Thin JSON-on-disk config store with Zod validation and an in-memory cache.
 *
 * The cache is established by {@link load} (or {@link save}/{@link update}) and
 * read by {@link get}. Callers must `load()` before `get()`.
 */
export class ConfigStore {
  private cached: Config | undefined;

  constructor(public readonly filePath: string) {}

  /** Reads from disk, validates, and caches. Returns defaults if the file is missing. */
  async load(): Promise<Config> {
    if (!existsSync(this.filePath)) {
      this.cached = ConfigSchema.parse({});
      return this.cached;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (err) {
      throw new Error(`Config file at ${this.filePath} contains invalid JSON: ${(err as Error).message}`);
    }
    const parsed = ConfigSchema.safeParse(this.migrate(raw));
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid config at ${this.filePath}:\n${issues}`);
    }
    this.cached = parsed.data;
    return this.cached;
  }

  /** Returns the cached config; throws if `load()` has not been called. */
  get(): Config {
    if (!this.cached) {
      throw new Error("ConfigStore.get(): config not loaded yet — call load() first.");
    }
    return this.cached;
  }

  /** Persists a full config to disk after Zod validation, updating the cache. */
  async save(next: Config): Promise<void> {
    const parsed = ConfigSchema.parse(next);
    writeFileSync(this.filePath, JSON.stringify(parsed, null, 2), "utf8");
    this.cached = parsed;
  }

  /** Deep-merges a partial patch into the current config and persists it. */
  async update(patch: DeepPartial<Config>): Promise<Config> {
    const base = this.cached ?? (await this.load());
    const merged = deepMerge(base, patch) as unknown;
    const parsed = ConfigSchema.parse(merged);
    writeFileSync(this.filePath, JSON.stringify(parsed, null, 2), "utf8");
    this.cached = parsed;
    return parsed;
  }

  /** Migration stub — schemaVersion=1 is the only known shape today. */
  private migrate(raw: unknown): unknown {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (obj.schemaVersion === undefined) obj.schemaVersion = 1;
    }
    return raw;
  }
}

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const existing = out[k];
    if (isPlainObject(existing) && isPlainObject(v)) {
      out[k] = deepMerge(existing, v as DeepPartial<typeof existing>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
