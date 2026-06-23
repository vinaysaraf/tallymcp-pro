import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backupTimestamped,
  listBackups,
  restoreLatest,
  MAX_TIMESTAMPED_BACKUPS,
  type Clock,
} from "../src/backups.js";

/** Clock that advances one minute per call so each backup gets a distinct stamp. */
function steppingClock(startISO: string): Clock {
  let t = new Date(startISO).getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe("backups", () => {
  let dir: string;
  let cfg: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "backups-"));
    cfg = join(dir, "claude_desktop_config.json");
    await writeFile(cfg, JSON.stringify({ mcpServers: { a: { command: "x", args: [] } } }, null, 2));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when the source file is missing", async () => {
    const res = await backupTimestamped(join(dir, "nope.json"));
    expect(res).toBeNull();
  });

  it("creates a timestamped backup and lists newest-first", async () => {
    const clock = steppingClock("2026-06-23T10:00:00");
    const first = await backupTimestamped(cfg, clock);
    const second = await backupTimestamped(cfg, clock);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const list = await listBackups(cfg);
    expect(list).toHaveLength(2);
    // newest first
    expect(list[0]!.takenAt.getTime()).toBeGreaterThan(list[1]!.takenAt.getTime());
    expect(list[0]!.backupPath).toBe(second!.backupPath);
  });

  it("includes the pristine .bak in listBackups", async () => {
    await copyFile(cfg, `${cfg}.bak`);
    await backupTimestamped(cfg, steppingClock("2026-06-23T10:00:00"));
    const list = await listBackups(cfg);
    expect(list.some((b) => b.backupPath === `${cfg}.bak`)).toBe(true);
  });

  it("prunes to the newest MAX_TIMESTAMPED_BACKUPS", async () => {
    const clock = steppingClock("2026-06-23T10:00:00");
    for (let i = 0; i < MAX_TIMESTAMPED_BACKUPS + 3; i++) {
      await backupTimestamped(cfg, clock);
    }
    const remaining = (await readdir(dir)).filter((n) => n.includes(".tallymcp-"));
    expect(remaining).toHaveLength(MAX_TIMESTAMPED_BACKUPS);
  });

  it("restoreLatest restores newest content and snapshots the current file first", async () => {
    const clock = steppingClock("2026-06-23T10:00:00");
    // Backup the original, then mutate the live file.
    await backupTimestamped(cfg, clock);
    const original = await readFile(cfg, "utf8");
    await writeFile(cfg, JSON.stringify({ mcpServers: { BROKEN: true } }, null, 2));

    const outcome = await restoreLatest(cfg, clock);
    expect(outcome).not.toBeNull();
    // live file now equals the original backed-up content
    expect(await readFile(cfg, "utf8")).toBe(original);
    // the broken current file was snapshotted first (reversible)
    expect(outcome!.currentBackedUpTo).not.toBeNull();
    expect(await readFile(outcome!.currentBackedUpTo!, "utf8")).toContain("BROKEN");
  });

  it("restoreLatest returns null when no backup exists", async () => {
    expect(await restoreLatest(cfg, steppingClock("2026-06-23T10:00:00"))).toBeNull();
  });

  it("never prunes the pristine .bak even past the cap", async () => {
    await copyFile(cfg, `${cfg}.bak`); // pristine
    const clock = steppingClock("2026-06-23T10:00:00");
    for (let i = 0; i < MAX_TIMESTAMPED_BACKUPS + 3; i++) {
      await backupTimestamped(cfg, clock);
    }
    const timestamped = (await readdir(dir)).filter((n) => n.includes(".tallymcp-"));
    expect(timestamped).toHaveLength(MAX_TIMESTAMPED_BACKUPS);
    // pristine survives
    await expect(readFile(`${cfg}.bak`, "utf8")).resolves.toBeDefined();
  });

  it("lists and restores a manual ms-less .tallymcp- backup (back-compat)", async () => {
    const manual = `${cfg}.tallymcp-20260623-120000.bak`; // no millisecond suffix
    await writeFile(manual, "MANUAL");
    const list = await listBackups(cfg);
    const found = list.find((b) => b.backupPath === manual);
    expect(found).toBeDefined();
    expect(found!.takenAt.getFullYear()).toBe(2026);
    // it's the only backup → restoreLatest restores its content
    const outcome = await restoreLatest(cfg, steppingClock("2026-06-24T10:00:00"));
    expect(outcome!.restoredFrom).toBe(manual);
    expect(await readFile(cfg, "utf8")).toBe("MANUAL");
  });
});
