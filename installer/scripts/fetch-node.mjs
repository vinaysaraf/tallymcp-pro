#!/usr/bin/env node
/**
 * Downloads a pinned portable Node 20 LTS and extracts node.exe to
 * installer/staging/node.exe. electron-builder's extraFiles config
 * (apps/configurator/electron-builder.yml) then copies it to
 * <installDir>\node.exe — the path the Phase 2 wire snippet expects.
 *
 * Cached: re-runs detect the existing node.exe and skip the download.
 * Version: pinned to a specific Node 20 LTS for reproducibility. Bump
 * by editing NODE_VERSION below; the next run will re-download.
 */

import { createWriteStream } from "node:fs";
import { rm, mkdir, access, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const NODE_VERSION = "v20.18.1"; // pinned LTS as of 2026-05-26
const ARCH = "x64";              // installer is x64-only in Phase 3

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const stagingDir = join(repoRoot, "installer", "staging");
const targetExe = join(stagingDir, "node.exe");

const downloadUrl = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-${ARCH}.zip`;

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url, dest) {
  console.log(`[fetch-node] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  if (await fileExists(targetExe)) {
    const s = await stat(targetExe);
    console.log(
      `[fetch-node] cached at ${targetExe} (${(s.size / 1024 / 1024).toFixed(1)} MB) — skipping download`,
    );
    return;
  }

  await mkdir(stagingDir, { recursive: true });
  const tmpZip = join(tmpdir(), `node-${NODE_VERSION}-win-${ARCH}.zip`);
  await downloadTo(downloadUrl, tmpZip);

  // Extract node.exe from the zip. We use PowerShell's Expand-Archive
  // (available on Windows 10+) on Windows; on other platforms (CI lint
  // hosts) we fall back to `unzip`.
  const extractDir = join(tmpdir(), `node-${NODE_VERSION}-extract`);
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });

  let extract;
  if (process.platform === "win32") {
    extract = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -Path '${tmpZip}' -DestinationPath '${extractDir}' -Force`],
      { stdio: "inherit" },
    );
  } else {
    extract = spawnSync("unzip", ["-o", "-q", tmpZip, "-d", extractDir], {
      stdio: "inherit",
    });
  }
  if (extract.status !== 0) {
    throw new Error("zip extraction failed");
  }

  // Locate node.exe inside the extracted tree: node-<ver>-win-<arch>/node.exe.
  const innerDir = join(extractDir, `node-${NODE_VERSION}-win-${ARCH}`);
  const innerExe = join(innerDir, "node.exe");
  if (!(await fileExists(innerExe))) {
    throw new Error(`expected ${innerExe} inside the extracted zip`);
  }

  // Copy node.exe to installer/staging/node.exe.
  const { copyFile } = await import("node:fs/promises");
  await copyFile(innerExe, targetExe);

  // Best-effort cleanup of temp artifacts.
  await rm(tmpZip, { force: true }).catch(() => {});
  await rm(extractDir, { recursive: true, force: true }).catch(() => {});

  const s = await stat(targetExe);
  console.log(
    `[fetch-node] staged at ${targetExe} (${(s.size / 1024 / 1024).toFixed(1)} MB)`,
  );
}

main().catch((err) => {
  console.error("[fetch-node] failure:", err);
  process.exit(1);
});
