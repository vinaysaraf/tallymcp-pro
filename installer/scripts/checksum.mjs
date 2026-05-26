#!/usr/bin/env node
/**
 * Writes a SHA-256 sidecar (<artifact>.sha256) next to the installer
 * .exe produced by electron-builder. Format matches `sha256sum`:
 *
 *   <hex digest>  <basename>
 *
 * which lets the future Phase 4 `latest.json` flow + any user with a
 * standard sha256sum CLI verify the download.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const distDir = join(repoRoot, "apps", "configurator", "dist-installer");

async function sha256(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function main() {
  const entries = await readdir(distDir);
  const installers = entries.filter(
    (n) => n.startsWith("TallyMCP-Setup-") && n.endsWith(".exe"),
  );
  if (installers.length === 0) {
    console.error(`[checksum] no TallyMCP-Setup-*.exe in ${distDir}`);
    process.exit(1);
  }

  for (const name of installers) {
    const full = join(distDir, name);
    const size = (await stat(full)).size;
    const digest = await sha256(full);
    const sidecar = `${full}.sha256`;
    await writeFile(sidecar, `${digest}  ${basename(full)}\n`, "utf8");
    console.log(
      `[checksum] ${name}: ${digest} (${(size / 1024 / 1024).toFixed(1)} MB) → ${basename(sidecar)}`,
    );
  }
}

main().catch((err) => {
  console.error("[checksum] failure:", err);
  process.exit(1);
});
