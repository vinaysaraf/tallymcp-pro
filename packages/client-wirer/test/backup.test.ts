import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { backupIfMissing } from "../src/backup.js";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("backupIfMissing", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "backup-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates .bak on first call when source exists", async () => {
    const src = join(dir, "config.json");
    await writeFile(src, "original");
    const result = await backupIfMissing(src);
    expect(result.created).toBe(true);
    expect(result.backupPath).toBe(`${src}.bak`);
    expect(await readFile(`${src}.bak`, "utf8")).toBe("original");
  });

  it("does NOT overwrite an existing .bak", async () => {
    const src = join(dir, "config.json");
    await writeFile(src, "current");
    await writeFile(`${src}.bak`, "pristine");
    const result = await backupIfMissing(src);
    expect(result.created).toBe(false);
    expect(await readFile(`${src}.bak`, "utf8")).toBe("pristine");
  });

  it("returns created=false when source does not exist", async () => {
    const src = join(dir, "nonexistent.json");
    const result = await backupIfMissing(src);
    expect(result.created).toBe(false);
    expect(result.backupPath).toBe(`${src}.bak`);
    await expect(stat(`${src}.bak`)).rejects.toThrow();
  });
});
