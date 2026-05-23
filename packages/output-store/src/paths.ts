import { mkdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { GeneratedFile } from "@tallymcp/shared-types";

/** Coerces a string into a filesystem-safe filename segment. */
export function safeFileName(input: string, maxLen = 60): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned.length === 0 ? "file" : cleaned).slice(0, maxLen);
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
