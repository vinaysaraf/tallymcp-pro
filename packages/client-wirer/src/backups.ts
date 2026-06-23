import { copyFile, readdir, readFile, stat, unlink, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, basename, join } from "node:path";
import { writeAtomic } from "./atomic-write.js";

/**
 * Timestamped config backups + restore for AI-client config files.
 *
 * Why this exists: Claude Desktop (and other clients) can silently corrupt or
 * reset their own config on a parse error, and a single rolling `.bak` only
 * captures the first touch. Before every write we snapshot the live file to a
 * timestamped sibling so there is always a recent, dated recovery point, and
 * `restoreLatest` rewinds to the newest one (itself snapshotting the current,
 * possibly-broken file first so the restore is reversible).
 *
 * Dependency-free (node built-ins only) so it can be unit-tested without a
 * live client and runtime-smoke-tested with a bare `node` script.
 */

export interface BackupInfo {
  /** Absolute path to the backup file. */
  backupPath: string;
  /** When the backup was taken (parsed from the filename, or mtime for the pristine `.bak`). */
  takenAt: Date;
}

export interface RestoreOutcome {
  /** The backup that was restored over the live file. */
  restoredFrom: string;
  /** When that backup was taken. */
  takenAt: Date;
  /** Where the (pre-restore) current file was snapshotted, or null if there was no live file. */
  currentBackedUpTo: string | null;
}

/** Injectable clock so tests are deterministic. Production passes the default. */
export type Clock = () => Date;

const DEFAULT_CLOCK: Clock = () => new Date();

/** Keep at most this many timestamped backups per file (the pristine `.bak` is never pruned). */
export const MAX_TIMESTAMPED_BACKUPS = 10;

/** `<name>.tallymcp-YYYYMMDD-HHMMSS[-mmm].bak` — the `-mmm` ms group is optional for back-compat. */
const STAMP_RE = /\.tallymcp-(\d{8})-(\d{6})(?:-(\d{3}))?\.bak$/;

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** Local-time `YYYYMMDD-HHMMSS-mmm` — millisecond suffix avoids same-second collisions. */
function stamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `-${pad(d.getMilliseconds(), 3)}`
  );
}

function parseStamp(fileName: string): Date | null {
  const m = STAMP_RE.exec(fileName);
  if (!m) return null;
  const [, ymd, hms, ms] = m;
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
    Number(hms.slice(0, 2)),
    Number(hms.slice(2, 4)),
    Number(hms.slice(4, 6)),
    ms ? Number(ms) : 0,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot `path` to `<path>.tallymcp-<stamp>.bak`, then prune to the newest
 * `MAX_TIMESTAMPED_BACKUPS`. Returns null if `path` does not exist (nothing to
 * back up). Never deletes the pristine `<path>.bak`.
 */
export async function backupTimestamped(
  path: string,
  now: Clock = DEFAULT_CLOCK,
): Promise<BackupInfo | null> {
  if (!(await exists(path))) return null;
  const takenAt = now();
  const backupPath = `${path}.tallymcp-${stamp(takenAt)}.bak`;
  await copyFile(path, backupPath);
  await prune(path);
  return { backupPath, takenAt };
}

/** Delete oldest timestamped backups beyond the cap. The pristine `.bak` is never matched/pruned. */
async function prune(path: string): Promise<void> {
  const timestamped = (await listTimestamped(path)).sort(
    (a, b) => b.takenAt.getTime() - a.takenAt.getTime(),
  );
  for (const old of timestamped.slice(MAX_TIMESTAMPED_BACKUPS)) {
    // Cleanup is best-effort; a locked file on Windows shouldn't fail the write.
    // Log to stderr (never stdout — that's the MCP JSON-RPC channel elsewhere)
    // so an over-cap backup count is diagnosable.
    await unlink(old.backupPath).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[client-wirer] could not prune backup ${old.backupPath}: ${msg}`);
    });
  }
}

async function listTimestamped(path: string): Promise<BackupInfo[]> {
  const dir = dirname(path);
  const base = basename(path);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  for (const name of names) {
    if (!name.startsWith(`${base}.tallymcp-`)) continue;
    const takenAt = parseStamp(name);
    if (takenAt) out.push({ backupPath: join(dir, name), takenAt });
  }
  return out;
}

/**
 * All recoverable backups for `path`, newest first: every timestamped backup
 * plus the pristine `<path>.bak` (dated by its mtime) when present.
 */
export async function listBackups(path: string): Promise<BackupInfo[]> {
  const all = await listTimestamped(path);
  const pristine = `${path}.bak`;
  if (await exists(pristine)) {
    try {
      const s = await stat(pristine);
      all.push({ backupPath: pristine, takenAt: s.mtime });
    } catch {
      // ignore — unreadable pristine backup
    }
  }
  return all.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
}

/**
 * Restore the most recent backup over `path`. Before overwriting, the current
 * (possibly-broken) file is itself snapshotted so the reset is reversible.
 * Returns null when there is no backup to restore.
 */
export async function restoreLatest(
  path: string,
  now: Clock = DEFAULT_CLOCK,
): Promise<RestoreOutcome | null> {
  const backups = await listBackups(path);
  if (backups.length === 0) return null;
  const latest = backups[0]!;

  // Snapshot the current file first (only if it exists) so Reset is reversible.
  const snapshot = await backupTimestamped(path, now);

  // Atomic copy: read backup, write via tmp+fsync+rename.
  const content = await readFile(latest.backupPath, "utf8");
  await writeAtomic(path, content);

  return {
    restoredFrom: latest.backupPath,
    takenAt: latest.takenAt,
    currentBackedUpTo: snapshot?.backupPath ?? null,
  };
}
