import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectTallyInstall, type TallyInstall } from "../src/tally-detect.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("detectTallyInstall", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tally-detect-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns null when no Tally folder exists in the scan roots", async () => {
    const result = await detectTallyInstall({ scanRoots: [root] });
    expect(result).toBeNull();
  });

  it("finds a single TallyPrime install", async () => {
    const tallyDir = join(root, "TallyPrime");
    await mkdir(tallyDir);
    await writeFile(join(tallyDir, "tally.exe"), "");
    await writeFile(join(tallyDir, "tally.ini"), "[TALLY]\n");

    const result = await detectTallyInstall({ scanRoots: [root] });
    expect(result).not.toBeNull();
    expect((result as TallyInstall).exePath).toBe(join(tallyDir, "tally.exe"));
    expect((result as TallyInstall).iniPath).toBe(join(tallyDir, "tally.ini"));
  });

  it("returns the first when multiple installs exist", async () => {
    await mkdir(join(root, "TallyPrime"));
    await writeFile(join(root, "TallyPrime", "tally.exe"), "");
    await writeFile(join(root, "TallyPrime", "tally.ini"), "");
    await mkdir(join(root, "TallyPrime (1)"));
    await writeFile(join(root, "TallyPrime (1)", "tally.exe"), "");
    await writeFile(join(root, "TallyPrime (1)", "tally.ini"), "");

    const all = await detectTallyInstall({ scanRoots: [root], returnAll: true });
    expect(Array.isArray(all)).toBe(true);
    expect((all as TallyInstall[]).length).toBe(2);
  });
});
