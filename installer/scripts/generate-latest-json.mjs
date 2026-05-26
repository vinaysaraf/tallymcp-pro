#!/usr/bin/env node
/**
 * Generates latest.json (spec Appendix C format) for the v1.0 release
 * pipeline. Reads version from apps/configurator/package.json, sha256
 * from the corresponding .sha256 sidecar that Phase 3's pnpm package
 * produces, and tag/repo info from env vars passed in by the GitHub
 * Actions workflow (Task 9).
 *
 * Output: apps/configurator/dist-installer/latest.json
 *
 * Spec: docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md
 * Appendix C.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

/**
 * Pure function — testable. Inputs:
 *   version: app version, e.g. "1.0.0".
 *   sha256: hex digest of the .exe.
 *   tag: git tag, e.g. "v1.0.0".
 *   owner, repo: GitHub repo coordinates.
 *   now: Date — usually `new Date()` in production; tests inject a fixed
 *        time for reproducibility.
 *   minSupportedFromVersion: optional; defaults to the current version
 *        (a fresh release with no backwards-compat constraint).
 */
export function generateLatestJson({
  version,
  sha256,
  tag,
  owner,
  repo,
  now,
  minSupportedFromVersion,
}) {
  // Guard: the tag must equal `v${version}`. electron-builder names the
  // artifact `TallyMCP-Setup-v${version}.exe`, so if tag and version
  // drift (e.g. tag is v1.0.0 but package.json version is still 0.0.1),
  // the downloadUrl below would point at a non-existent file. The
  // release procedure (Task 10a §2) bumps the version BEFORE tagging
  // — this assertion catches the case where that step was skipped.
  // (Cursor review H2, 2026-05-26.)
  if (tag !== `v${version}`) {
    throw new Error(
      `tag/version mismatch: tag is "${tag}" but package.json version is "${version}"; ` +
        `expected tag === "v${version}". Bump the version before tagging.`,
    );
  }
  // Derive the artifact filename from `version` so it always matches
  // electron-builder's artifactName template `TallyMCP-Setup-v${version}.exe`.
  const artifactName = `TallyMCP-Setup-v${version}.exe`;
  return {
    version,
    publishedAt: now.toISOString(),
    downloadUrl: `https://github.com/${owner}/${repo}/releases/download/${tag}/${artifactName}`,
    sha256,
    minSupportedFromVersion: minSupportedFromVersion ?? version,
    releaseNotesUrl: `https://github.com/${owner}/${repo}/releases/tag/${tag}`,
  };
}

async function main() {
  // Read version from configurator package.json.
  const cfgPkgPath = join(repoRoot, "apps", "configurator", "package.json");
  const cfgPkg = JSON.parse(await readFile(cfgPkgPath, "utf8"));
  const version = cfgPkg.version;

  // Locate the .sha256 sidecar produced by Phase 3's checksum script.
  const distDir = join(repoRoot, "apps", "configurator", "dist-installer");
  const entries = await readdir(distDir);
  const sidecar = entries.find((n) => n.startsWith("TallyMCP-Setup-") && n.endsWith(".exe.sha256"));
  if (!sidecar) {
    console.error(`[generate-latest-json] no TallyMCP-Setup-*.exe.sha256 in ${distDir}`);
    process.exit(1);
  }
  const sidecarPath = join(distDir, sidecar);
  const sidecarLine = (await readFile(sidecarPath, "utf8")).trim();
  // sidecar format: "<hex>  <basename>"
  const sha256 = sidecarLine.split(/\s+/)[0];
  if (!sha256 || sha256.length !== 64) {
    console.error(`[generate-latest-json] bad sha256 in ${sidecarPath}: ${sidecarLine}`);
    process.exit(1);
  }

  // Tag, owner, repo from env vars (passed by the workflow).
  // GITHUB_REF_NAME is the tag name when the workflow runs on a tag push.
  const tag = process.env.GITHUB_REF_NAME ?? `v${version}`;
  const repoSlug = process.env.GITHUB_REPOSITORY ?? "vinaysaraf/tallymcp-pro";
  const [owner, repo] = repoSlug.split("/");

  const out = generateLatestJson({
    version,
    sha256,
    tag,
    owner,
    repo,
    now: new Date(),
    minSupportedFromVersion: process.env.MIN_SUPPORTED_FROM_VERSION,
  });

  const outPath = join(distDir, "latest.json");
  await writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[generate-latest-json] wrote ${outPath}`);
  console.log(JSON.stringify(out, null, 2));
}

// Only run main() if invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error("[generate-latest-json] failure:", err);
    process.exit(1);
  });
}
