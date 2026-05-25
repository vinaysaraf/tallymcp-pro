import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeAtomic } from "../src/atomic-write.js";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("writeAtomic", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes new file via .tmp then rename", async () => {
    const target = join(dir, "data.json");
    await writeAtomic(target, '{"a":1}');
    expect(await readFile(target, "utf8")).toBe('{"a":1}');
  });

  it("overwrites existing file atomically", async () => {
    const target = join(dir, "data.json");
    await writeFile(target, '{"old":true}');
    await writeAtomic(target, '{"new":true}');
    expect(await readFile(target, "utf8")).toBe('{"new":true}');
  });

  it("does not leave .tmp file behind on success", async () => {
    const target = join(dir, "data.json");
    await writeAtomic(target, "hello");
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    expect(entries).toEqual(["data.json"]);
  });
});
