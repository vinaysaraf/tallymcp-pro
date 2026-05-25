import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWireCommand } from "../src/commands/wire.js";
import { runUnwireCommand } from "../src/commands/unwire.js";
import { AbortError } from "../src/confirm.js";

describe("unwire CLI", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "unwire-cli-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes tallymcp-pro entry while preserving other servers", async () => {
    const installDir = join(dir, "TallyMCP");
    const env = { APPDATA: join(dir, "appdata") };
    await runWireCommand({ clientId: "claude-desktop", installDir, env, yes: true });

    // Inject sibling.
    const path = join(env.APPDATA, "Claude", "claude_desktop_config.json");
    const cfg = JSON.parse(await readFile(path, "utf8"));
    cfg.mcpServers["sibling"] = { command: "x", args: [] };
    await writeFile(path, JSON.stringify(cfg, null, 2));

    const result = await runUnwireCommand({ clientId: "claude-desktop", env, yes: true });
    expect(result.action).toBe("removed");

    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.mcpServers["tallymcp-pro"]).toBeUndefined();
    expect(after.mcpServers["sibling"]).toEqual({ command: "x", args: [] });
  });

  it("aborts when confirmFn returns false", async () => {
    const installDir = join(dir, "TallyMCP");
    const env = { APPDATA: join(dir, "appdata") };
    // Wire first so there is something to remove, then abort the unwire.
    await runWireCommand({ clientId: "claude-desktop", installDir, env, yes: true });

    const configPath = join(env.APPDATA, "Claude", "claude_desktop_config.json");
    const before = await readFile(configPath, "utf8");

    await expect(
      runUnwireCommand({
        clientId: "claude-desktop",
        env,
        yes: false,
        confirmFn: async () => false,
      }),
    ).rejects.toThrow(AbortError);

    // Verify config was not modified
    const after = await readFile(configPath, "utf8");
    const parsedAfter = JSON.parse(after);
    expect(parsedAfter.mcpServers["tallymcp-pro"]).toBeDefined();
    void before; // consumed for symmetry
  });
});
