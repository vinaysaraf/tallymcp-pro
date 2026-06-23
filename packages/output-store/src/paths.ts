import { mkdirSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import type { GeneratedFile } from "@tallymcp/shared-types";

/** Coerces a string into a filesystem-safe filename segment. */
export function safeFileName(input: string, maxLen = 60): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned.length === 0 ? "file" : cleaned).slice(0, maxLen);
}

/**
 * Resolves a configured output folder to an absolute path. A RELATIVE folder
 * (e.g. the default `./tallymcp-output`) is resolved against the user's HOME
 * directory — never the process CWD. An MCP server's CWD is chosen by the AI
 * client and is often very deep (e.g. a sandboxed AppContainer path), so a
 * CWD-relative output dir easily pushed generated file paths past Windows'
 * 259-character limit ("Cannot open … path is more than 259 characters").
 * Absolute folders are returned unchanged so a user override is respected.
 */
export function resolveOutputDir(folder: string, home: string = homedir()): string {
  return isAbsolute(folder) ? folder : resolve(home, folder);
}

/**
 * Compacts an ISO timestamp into a short, filename-safe `YYYYMMDD-HHMMSS`
 * stamp (15 chars) to keep generated filenames short. Falls back to a
 * colon/dot-stripped form for any non-ISO input.
 */
export function compactStamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}` : iso.replace(/[:.]/g, "-");
}

/** Ensures `dir` exists; idempotent. Returns the absolute path. */
export function ensureDir(dir: string): string {
  const abs = resolve(dir);
  mkdirSync(abs, { recursive: true });
  return abs;
}

/** Stats `path` and returns a {@link GeneratedFile} record. */
export function generatedFileFor(path: string, mimeType: string): GeneratedFile {
  const stats = statSync(path);
  return {
    path,
    fileName: basename(path),
    mimeType,
    sizeBytes: stats.size,
    generatedAt: new Date().toISOString(),
  };
}

export const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MIME_JSON = "application/json";
export const MIME_CSV = "text/csv; charset=utf-8";
