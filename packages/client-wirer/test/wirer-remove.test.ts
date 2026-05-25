import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = { command: "node.exe", args: ["main.js"] };

describe("ClientWirer.remove", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-remove-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes tallymcp-pro and leaves siblings intact", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer = new ClientWirer({ env, entry: ENTRY });
    await wirer.add("claude-desktop");

    // Inject a sibling server manually.
    const path = join(env.APPDATA, "Claude", "claude_desktop_config.json");
    const cfg = JSON.parse(await readFile(path, "utf8"));
    cfg.mcpServers["sibling"] = { command: "/bin/sh", args: [] };
    await (await import("node:fs/promises")).writeFile(path, JSON.stringify(cfg, null, 2));

    const result = await wirer.remove("claude-desktop");
    expect(result.action).toBe("removed");

    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.mcpServers["tallymcp-pro"]).toBeUndefined();
    expect(after.mcpServers["sibling"]).toEqual({ command: "/bin/sh", args: [] });
  });

  it("returns noop when key absent", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer = new ClientWirer({ env, entry: ENTRY });
    const result = await wirer.remove("claude-desktop");
    expect(result.action).toBe("noop");
  });
});
