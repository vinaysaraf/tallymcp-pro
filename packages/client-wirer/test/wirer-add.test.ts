import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import type { McpServerEntry } from "../src/types.js";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants } from "node:fs";

const ENTRY: McpServerEntry = {
  command: "C:\\TallyMCP\\node.exe",
  args: ["C:\\TallyMCP\\mcp-server\\main.js"],
  env: { TALLYMCP_CONFIG: "C:\\TallyMCP\\config.json" },
};

function makeWirer(env: Record<string, string>): ClientWirer {
  return new ClientWirer({ env, entry: ENTRY });
}

describe("ClientWirer.add", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-add-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a fresh config when file is absent", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer = makeWirer(env);
    const result = await wirer.add("claude-desktop");

    expect(result.action).toBe("added");
    expect(result.backupCreated).toBe(false); // no source file → no backup
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toEqual(ENTRY);
  });

  it("preserves existing servers and creates .bak on first add", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const claudeDir = join(env.APPDATA, "Claude");
    const claudeFile = join(claudeDir, "claude_desktop_config.json");
    await (await import("node:fs/promises")).mkdir(claudeDir, { recursive: true });
    await writeFile(
      claudeFile,
      JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }, null, 2),
    );

    const wirer = makeWirer(env);
    const result = await wirer.add("claude-desktop");

    expect(result.action).toBe("added");
    expect(result.backupCreated).toBe(true);
    await access(`${claudeFile}.bak`, constants.F_OK);

    const written = JSON.parse(await readFile(claudeFile, "utf8"));
    expect(written.mcpServers["other"]).toEqual({ command: "x", args: [] });
    expect(written.mcpServers["tallymcp-pro"]).toEqual(ENTRY);
  });

  it("returns action=noop when re-running with identical entry", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer = makeWirer(env);
    await wirer.add("claude-desktop");
    const second = await wirer.add("claude-desktop");
    expect(second.action).toBe("noop");
  });

  it("returns action=updated when re-running with a changed entry", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const wirer1 = makeWirer(env);
    await wirer1.add("claude-desktop");
    const wirer2 = new ClientWirer({
      env,
      entry: { ...ENTRY, command: "C:\\NewPath\\node.exe" },
    });
    const second = await wirer2.add("claude-desktop");
    expect(second.action).toBe("updated");
  });

  it("aborts on malformed existing JSON instead of clobbering", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const claudeDir = join(env.APPDATA, "Claude");
    const claudeFile = join(claudeDir, "claude_desktop_config.json");
    await (await import("node:fs/promises")).mkdir(claudeDir, { recursive: true });
    await writeFile(claudeFile, "{ this is not valid JSON");
    const wirer = makeWirer(env);
    await expect(wirer.add("claude-desktop")).rejects.toThrow(/parse/i);
  });
});
