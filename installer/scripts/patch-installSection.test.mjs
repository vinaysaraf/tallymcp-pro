import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchInstallSection } from "./patch-installSection.mjs";

describe("patchInstallSection", () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "patch-installSection-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("replaces SetDetailsPrint none with SetDetailsPrint both", async () => {
    const file = join(tmpDir, "installSection.nsh");
    await writeFile(file, "Section\n  SetDetailsPrint none\n  WriteRegStr ...\nSectionEnd\n");
    await patchInstallSection(file);
    const out = await readFile(file, "utf8");
    expect(out).toContain("SetDetailsPrint both");
    expect(out).not.toContain("SetDetailsPrint none");
  });

  it("is idempotent — running twice keeps the patched state", async () => {
    const file = join(tmpDir, "installSection.nsh");
    await writeFile(file, "Section\n  SetDetailsPrint none\nSectionEnd\n");
    await patchInstallSection(file);
    await patchInstallSection(file); // second run is a no-op
    const out = await readFile(file, "utf8");
    expect(out.match(/SetDetailsPrint both/g)?.length).toBe(1);
  });

  it("throws when the target file does not exist", async () => {
    await expect(patchInstallSection(join(tmpDir, "missing.nsh"))).rejects.toThrow();
  });

  it("preserves other lines unchanged", async () => {
    const file = join(tmpDir, "installSection.nsh");
    const original = "Section\n  SetDetailsPrint none\n  WriteRegStr HKLM \"Software\\App\" \"Version\" \"1.0\"\n  Push 'arg'\nSectionEnd\n";
    await writeFile(file, original);
    await patchInstallSection(file);
    const out = await readFile(file, "utf8");
    expect(out).toContain('WriteRegStr HKLM "Software\\App" "Version" "1.0"');
    expect(out).toContain("Push 'arg'");
  });
});
