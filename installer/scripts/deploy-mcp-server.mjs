#!/usr/bin/env node
/**
 * Stages @tallymcp/mcp-server's BUNDLED build output at
 * installer/staging/mcp-server/, ready for electron-builder's extraFiles
 * config (apps/configurator/electron-builder.yml) to copy it into the
 * NSIS install dir at <installDir>\mcp-server\.
 *
 * v1.0.5+ (#152): replaces the previous `pnpm deploy --prod` step (which
 * produced a symlink-heavy node_modules layout that broke on Windows NSIS
 * extraction) with a simple 3-file copy of the esbuild-produced bundle.
 * The bundle is fully self-contained — no node_modules at runtime.
 *
 * Idempotent: removes the staging dir first so reruns produce clean output.
 */

import { rm, mkdir, access, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const stagingDir = join(repoRoot, "installer", "staging", "mcp-server");
const mcpDir = join(repoRoot, "apps", "mcp-server");

async function main() {
  console.log(`[deploy-mcp-server] cleaning ${stagingDir}`);
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  // Step 1: build mcp-server (tsc + esbuild → produces dist/main.bundle.js).
  console.log(`[deploy-mcp-server] building @tallymcp/mcp-server (tsc + esbuild)`);
  const build = spawnSync(
    "pnpm",
    ["--filter", "@tallymcp/mcp-server", "build"],
    { cwd: repoRoot, stdio: "inherit", shell: true },
  );
  if (build.status !== 0) {
    console.error("[deploy-mcp-server] mcp-server build failed");
    process.exit(build.status ?? 1);
  }

  // Step 2: copy the bundle + sourcemap + a minimal package.json to staging.
  const sourceBundle = join(mcpDir, "dist", "main.bundle.js");
  const sourceMap = join(mcpDir, "dist", "main.bundle.js.map");
  const destBundle = join(stagingDir, "main.bundle.js");
  const destMap = join(stagingDir, "main.bundle.js.map");

  await access(sourceBundle);
  await copyFile(sourceBundle, destBundle);
  await copyFile(sourceMap, destMap);

  // Step 3: write a minimal package.json declaring `type: module` so Node
  // treats main.bundle.js as ESM. No `dependencies` field — the bundle is
  // self-contained.
  await writeFile(
    join(stagingDir, "package.json"),
    JSON.stringify(
      {
        name: "@tallymcp/mcp-server",
        version: "0.0.1",
        private: true,
        type: "module",
        main: "main.bundle.js",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  // Step 4: sanity-check.
  await access(destBundle);

  console.log(`[deploy-mcp-server] staged at ${stagingDir}`);
  console.log(`[deploy-mcp-server]   main.bundle.js + main.bundle.js.map + package.json`);
}

main().catch((err) => {
  console.error("[deploy-mcp-server] unexpected failure:", err);
  process.exit(1);
});
