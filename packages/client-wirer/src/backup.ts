import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";

export interface BackupResult {
  /** Whether we created a backup in this call. */
  created: boolean;
  /** Path the backup would live at (whether created now, earlier, or never). */
  backupPath: string;
}

/**
 * Copy `path` to `${path}.bak` ONLY if that backup does not already exist.
 *
 * - If source missing → `{created: false, backupPath}` (idempotent, doesn't throw).
 * - If backup already exists → `{created: false}` (preserves the pristine copy).
 * - Otherwise → copies and returns `{created: true}`.
 */
export async function backupIfMissing(path: string): Promise<BackupResult> {
  const backupPath = `${path}.bak`;
  // Backup already exists? Leave it alone.
  try {
    await access(backupPath, constants.F_OK);
    return { created: false, backupPath };
  } catch {
    // No backup yet — fall through.
  }
  // Source missing? Nothing to back up.
  try {
    await access(path, constants.F_OK);
  } catch {
    return { created: false, backupPath };
  }
  await copyFile(path, backupPath);
  return { created: true, backupPath };
}
