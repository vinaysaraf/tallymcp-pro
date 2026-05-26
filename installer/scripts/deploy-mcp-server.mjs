#!/usr/bin/env node
/**
 * Stages @tallymcp/mcp-server with a flat production node_modules tree
 * at installer/staging/mcp-server/, ready for electron-builder's
 * extraFiles config (apps/configurator/electron-builder.yml) to copy
 * it into the NSIS install dir at <installDir>\mcp-server\.
 *
 * Uses pnpm's `deploy` command which is purpose-built for this — it
 * handles workspace protocol resolution, prunes devDependencies, and
 * produces a self-contained tree that runs without pnpm or symlinks.
 *
 * Idempotent: removes the staging dir first so reruns produce clean
 * output.
 */

import { rm, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const stagingDir = join(repoRoot, "installer", "staging", "mcp-server");

async function main() {
  console.log(`[deploy-mcp-server] cleaning ${stagingDir}`);
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(dirname(stagingDir), { recursive: true });

  // Step 1: build mcp-server so dist/ is fresh.
  console.log(`[deploy-mcp-server] building @tallymcp/mcp-server`);
  const build = spawnSync(
    "pnpm",
    ["--filter", "@tallymcp/mcp-server", "build"],
    { cwd: repoRoot, stdio: "inherit", shell: true },
  );
  if (build.status !== 0) {
    console.error("[deploy-mcp-server] mcp-server build failed");
    process.exit(build.status ?? 1);
  }

  // Step 2: pnpm deploy --prod. This creates a flat node_modules under
  // stagingDir, copying only production dependencies of @tallymcp/mcp-server.
  // Note: pnpm 9 on Windows rejects absolute paths with drive letters as
  // the deploy target ("ERR_PNPM_INVALID_DEPLOY_TARGET"). Pass a relative
  // path from repoRoot instead.
  const stagingRelative = join("installer", "staging", "mcp-server");
  console.log(`[deploy-mcp-server] running pnpm deploy --prod → ${stagingDir}`);
  const deploy = spawnSync(
    "pnpm",
    ["--filter=@tallymcp/mcp-server", "deploy", "--prod", stagingRelative],
    { cwd: repoRoot, stdio: "inherit", shell: true },
  );
  if (deploy.status !== 0) {
    console.error("[deploy-mcp-server] pnpm deploy failed");
    process.exit(deploy.status ?? 1);
  }

  // Step 3: sanity-check the entry point.
  try {
    await access(join(stagingDir, "dist", "main.js"));
  } catch {
    console.error(
      `[deploy-mcp-server] expected ${join(stagingDir, "dist", "main.js")} ` +
        `to exist after deploy; build output layout may have changed.`,
    );
    process.exit(1);
  }

  console.log(`[deploy-mcp-server] staged at ${stagingDir}`);
}

main().catch((err) => {
  console.error("[deploy-mcp-server] unexpected failure:", err);
  process.exit(1);
});
