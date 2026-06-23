import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import type { Clock } from "../src/backups.js";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = { command: "node.exe", args: ["main.js"] };

/** Distinct, increasing timestamps so each backup filename is unique. */
function steppingClock(startISO: string): Clock {
  let t = new Date(startISO).getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe("ClientWirer.restore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-restore-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("restores the most recent backup (the pre-rewrite state)", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const clock = steppingClock("2026-06-23T10:00:00");
    const path = join(env.APPDATA, "Claude", "claude_desktop_config.json");

    // First wire creates the file (no backup yet — nothing to snapshot).
    await new ClientWirer({ env, entry: ENTRY, now: clock }).add("claude-desktop");
    const preRewrite = await readFile(path, "utf8");

    // Re-wire with a different entry → write → snapshots the pre-rewrite file.
    await new ClientWirer({
      env,
      entry: { command: "other.exe", args: ["x"] },
      now: clock,
    }).add("claude-desktop");
    expect(await readFile(path, "utf8")).not.toBe(preRewrite); // changed

    const result = await new ClientWirer({ env, entry: ENTRY, now: clock }).restore(
      "claude-desktop",
    );
    expect(result.action).toBe("restored");
    expect(result.restoredFromISO).toBeDefined();
    // Live file rewound to the pre-rewrite content.
    expect(await readFile(path, "utf8")).toBe(preRewrite);
  });

  it("returns noop when there is no backup to restore", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const result = await new ClientWirer({ env, entry: ENTRY }).restore("claude-desktop");
    expect(result.action).toBe("noop");
    expect(result.restoredFromISO).toBeUndefined();
  });

  it("restores BOTH the standard and MSIX paths for Claude Desktop", async () => {
    const env = {
      APPDATA: join(dir, "appdata"),
      LOCALAPPDATA: join(dir, "localappdata"),
    };
    const clock = steppingClock("2026-06-23T10:00:00");
    // Both Claude dirs exist → resolver returns standard + MSIX.
    await mkdir(join(env.APPDATA, "Claude"), { recursive: true });
    const msixDir = join(
      env.LOCALAPPDATA,
      "Packages",
      "Claude_test",
      "LocalCache",
      "Roaming",
      "Claude",
    );
    await mkdir(msixDir, { recursive: true });
    const stdPath = join(env.APPDATA, "Claude", "claude_desktop_config.json");
    const msixPath = join(msixDir, "claude_desktop_config.json");

    await new ClientWirer({ env, entry: ENTRY, now: clock }).add("claude-desktop");
    const stdPre = await readFile(stdPath, "utf8");
    const msixPre = await readFile(msixPath, "utf8");

    await new ClientWirer({
      env,
      entry: { command: "other.exe", args: ["x"] },
      now: clock,
    }).add("claude-desktop");

    const result = await new ClientWirer({ env, entry: ENTRY, now: clock }).restore("claude-desktop");
    expect(result.action).toBe("restored");
    expect(result.configPaths).toHaveLength(2);
    expect(await readFile(stdPath, "utf8")).toBe(stdPre);
    expect(await readFile(msixPath, "utf8")).toBe(msixPre);
  });
});
