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

describe("ClientWirer.add — MSIX/Store path (v1.0.3 #140)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-msix-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes Claude Desktop config to BOTH standard + MSIX paths when both exist", async () => {
    const appData = join(dir, "Roaming");
    const localAppData = join(dir, "Local");
    // Pre-create both folders so the resolver picks both up.
    await (await import("node:fs/promises")).mkdir(join(appData, "Claude"), { recursive: true });
    await (await import("node:fs/promises")).mkdir(
      join(localAppData, "Packages", "Claude_test12345", "LocalCache", "Roaming", "Claude"),
      { recursive: true },
    );

    const env = { APPDATA: appData, LOCALAPPDATA: localAppData };
    const wirer = makeWirer(env);
    const result = await wirer.add("claude-desktop");

    expect(result.configPaths).toHaveLength(2);
    expect([...result.variants].sort()).toEqual(["msix", "standard"]);

    // Verify BOTH files were written with our entry
    for (const path of result.configPaths) {
      const written = JSON.parse(await readFile(path, "utf8"));
      expect(written.mcpServers["tallymcp-pro"]).toEqual(ENTRY);
    }
  });

  it("writes only to MSIX path when standard Claude folder is absent", async () => {
    const appData = join(dir, "Roaming");
    const localAppData = join(dir, "Local");
    await (await import("node:fs/promises")).mkdir(
      join(localAppData, "Packages", "Claude_test12345", "LocalCache", "Roaming", "Claude"),
      { recursive: true },
    );

    const env = { APPDATA: appData, LOCALAPPDATA: localAppData };
    const wirer = makeWirer(env);
    const result = await wirer.add("claude-desktop");

    expect(result.configPaths).toHaveLength(1);
    expect(result.variants).toEqual(["msix"]);
    const written = JSON.parse(await readFile(result.configPaths[0]!, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toEqual(ENTRY);
  });

  it("falls back to creating standard path when NEITHER directory pre-exists", async () => {
    const appData = join(dir, "Roaming");
    const localAppData = join(dir, "Local");
    const env = { APPDATA: appData, LOCALAPPDATA: localAppData };
    const wirer = makeWirer(env);
    const result = await wirer.add("claude-desktop");

    expect(result.configPaths).toHaveLength(1);
    expect(result.variants).toEqual(["standard"]);
    expect(result.configPaths[0]).toContain(`${join("Roaming", "Claude")}`);
  });

  it("non-Claude-Desktop clients still return single-path result", async () => {
    const env = {
      APPDATA: join(dir, "Roaming"),
      LOCALAPPDATA: join(dir, "Local"),
      USERPROFILE: join(dir, "userprofile"),
    };
    const wirer = makeWirer(env);
    const result = await wirer.add("cursor");
    expect(result.configPaths).toHaveLength(1);
    expect(result.variants).toEqual(["standard"]);
    expect(result.configPath).toBe(result.configPaths[0]);
  });
});
