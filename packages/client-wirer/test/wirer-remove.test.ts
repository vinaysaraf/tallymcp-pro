import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
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

    // remove() must create/preserve .bak
    await access(`${path}.bak`, constants.F_OK);
  });

  it("creates .bak on remove when none exists yet", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const configDir = join(env.APPDATA, "Claude");
    const configPath = join(configDir, "claude_desktop_config.json");

    // Hand-craft a config with tallymcp-pro present, no .bak.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(configDir, { recursive: true });
    const preRemoveContent = JSON.stringify({
      mcpServers: { "tallymcp-pro": ENTRY, "other": { command: "x", args: [] } },
    }, null, 2) + "\n";
    await writeFile(configPath, preRemoveContent);
    // Confirm no .bak exists.
    await expect(access(`${configPath}.bak`, constants.F_OK)).rejects.toThrow();

    const wirer = new ClientWirer({ env, entry: ENTRY });
    const result = await wirer.remove("claude-desktop");
    expect(result.action).toBe("removed");

    // .bak must now exist and contain the pre-remove state.
    await access(`${configPath}.bak`, constants.F_OK);
    const bak = await readFile(`${configPath}.bak`, "utf8");
    expect(JSON.parse(bak).mcpServers["tallymcp-pro"]).toBeDefined();
  });

  it("returns noop when key absent", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer = new ClientWirer({ env, entry: ENTRY });
    const result = await wirer.remove("claude-desktop");
    expect(result.action).toBe("noop");
  });
});
