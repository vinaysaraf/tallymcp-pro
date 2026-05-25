import { readdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export interface TallyInstall {
  /** The folder, e.g. C:\Program Files\TallyPrime (1) */
  installDir: string;
  exePath: string;
  iniPath: string;
}

export interface DetectOptions {
  /** Directories to scan; default: standard Windows Program Files locations. */
  scanRoots?: string[];
  /** If true, return ALL detected installs; default false returns first only. */
  returnAll?: boolean;
}

const DEFAULT_SCAN_ROOTS = [
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

export async function detectTallyInstall(
  opts: DetectOptions = {},
): Promise<TallyInstall | TallyInstall[] | null> {
  const roots = opts.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const found: TallyInstall[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue; // root doesn't exist (e.g. on Linux CI)
    }
    for (const name of entries) {
      if (!/^TallyPrime/i.test(name)) continue;
      const installDir = join(root, name);
      const exePath = join(installDir, "tally.exe");
      const iniPath = join(installDir, "tally.ini");
      try {
        await access(exePath, constants.F_OK);
        await access(iniPath, constants.F_OK);
        found.push({ installDir, exePath, iniPath });
      } catch {
        // missing tally.exe or tally.ini — not a usable install
      }
    }
  }
  if (opts.returnAll) return found;
  return found[0] ?? null;
}
