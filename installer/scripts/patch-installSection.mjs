#!/usr/bin/env node
/**
 * Patches electron-builder's installSection.nsh template to enable per-file
 * extraction detail output in the NSIS wizard.
 *
 * Why: electron-builder's NSIS template ships with `SetDetailsPrint none`
 * which suppresses the per-file extraction log even when the details pane
 * is visible. Without per-file feedback, slow installs (Defender real-time
 * scanning on large signed binaries) appear frozen to users. Companion to
 * the `customHeader` macro in installer/installer.nsh that makes the pane
 * visible in the first place.
 *
 * Idempotent: running twice keeps the patched state without doubling.
 * Throws if the target file is missing (fail-loudly during release build).
 *
 * Reference: electron-builder issue #4719.
 * Spec: Cursor verdict 2026-05-27 on ai-review/v1.1-installer-ux-issues.md.
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Patch a single installSection.nsh file in place. Idempotent.
 * @param {string} filePath absolute path to the .nsh file
 * @returns {Promise<{patched: boolean, alreadyPatched: boolean}>}
 */
export async function patchInstallSection(filePath) {
  await access(filePath); // throws ENOENT if missing
  const content = await readFile(filePath, "utf8");
  if (content.includes("SetDetailsPrint both")) {
    return { patched: false, alreadyPatched: true };
  }
  if (!content.includes("SetDetailsPrint none")) {
    throw new Error(
      `patch-installSection: ${filePath} does not contain 'SetDetailsPrint none' — electron-builder template may have changed`,
    );
  }
  const patched = content.replace(/SetDetailsPrint none/g, "SetDetailsPrint both");
  await writeFile(filePath, patched, "utf8");
  return { patched: true, alreadyPatched: false };
}

/**
 * Locate every installSection.nsh under node_modules and patch each.
 * pnpm's hoisted layout means there may be multiple copies; patch them all
 * to be safe (electron-builder picks one based on the resolution graph).
 */
async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirname, "..", "..");
  const nodeModules = join(repoRoot, "node_modules");

  const { readdir } = await import("node:fs/promises");
  const targets = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // dir doesn't exist (e.g., fresh checkout); skip
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Don't recurse into hidden / non-electron-builder subdirs to save time
        if (entry.name === ".git" || entry.name === "dist" || entry.name === "dist-installer") continue;
        await walk(path);
      } else if (entry.name === "installSection.nsh") {
        targets.push(path);
      }
    }
  }
  await walk(nodeModules);

  if (targets.length === 0) {
    console.warn(
      "[patch-installSection] WARNING: no installSection.nsh found in node_modules — " +
        "electron-builder may not be installed yet. Run after pnpm install.",
    );
    return;
  }

  let patchedCount = 0;
  let alreadyCount = 0;
  for (const file of targets) {
    const result = await patchInstallSection(file);
    if (result.patched) {
      patchedCount++;
      console.log(`[patch-installSection] patched ${file}`);
    } else {
      alreadyCount++;
    }
  }
  console.log(
    `[patch-installSection] done: ${patchedCount} patched, ${alreadyCount} already-patched (of ${targets.length} total)`,
  );
}

// Only run main() when invoked directly (not when imported by the test).
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`
) {
  main().catch((err) => {
    console.error("[patch-installSection] failure:", err);
    process.exit(1);
  });
}
