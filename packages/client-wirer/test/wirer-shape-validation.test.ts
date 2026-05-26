import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = { command: "node.exe", args: ["main.js"] };

describe("ClientWirer JSON shape validation", () => {
  let dir: string;
  let env: Record<string, string>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-shape-"));
    env = { APPDATA: join(dir, "appdata") };
    // Pre-create the config directory so we can write a test file there.
    await mkdir(join(env.APPDATA, "Claude"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const configPath = (e: Record<string, string>) =>
    join(e.APPDATA, "Claude", "claude_desktop_config.json");

  it("rejects when config file top-level is an array", async () => {
    await writeFile(configPath(env), JSON.stringify([1, 2, 3]));
    const wirer = new ClientWirer({ env, entry: ENTRY });
    await expect(wirer.add("claude-desktop")).rejects.toThrow(
      /expected JSON object at top level/,
    );
  });

  it("rejects when mcpServers is an array", async () => {
    await writeFile(configPath(env), JSON.stringify({ mcpServers: [] }));
    const wirer = new ClientWirer({ env, entry: ENTRY });
    await expect(wirer.add("claude-desktop")).rejects.toThrow(
      /mcpServers.*expected a plain object/,
    );
  });

  it("rejects when mcpServers is a string", async () => {
    await writeFile(configPath(env), JSON.stringify({ mcpServers: "oops" }));
    const wirer = new ClientWirer({ env, entry: ENTRY });
    await expect(wirer.add("claude-desktop")).rejects.toThrow(
      /mcpServers.*expected a plain object/,
    );
  });

  it("accepts when mcpServers is absent", async () => {
    await writeFile(configPath(env), JSON.stringify({ theme: "dark" }));
    const wirer = new ClientWirer({ env, entry: ENTRY });
    const result = await wirer.add("claude-desktop");
    expect(result.action).toBe("added");
  });

  it("accepts a UTF-8 BOM-prefixed config (PowerShell-generated files)", async () => {
    // PowerShell's Out-File / ConvertTo-Json defaults to UTF-8 with BOM.
    // Many CA-facing config files originate from PowerShell scripts and
    // therefore have a leading U+FEFF. JSON.parse is strict and rejects it;
    // readJsonOrEmpty must strip it before parsing.
    const bomPlusJson =
      "﻿" +
      JSON.stringify({
        mcpServers: { existing: { command: "x", args: [] } },
      });
    await writeFile(configPath(env), bomPlusJson, "utf8");
    const wirer = new ClientWirer({ env, entry: ENTRY });
    const result = await wirer.add("claude-desktop");
    expect(result.action).toBe("added");
    // Sibling preserved
    const { readFile } = await import("node:fs/promises");
    const written = JSON.parse(await readFile(configPath(env), "utf8"));
    expect(written.mcpServers.existing).toEqual({ command: "x", args: [] });
    expect(written.mcpServers["tallymcp-pro"]).toEqual(ENTRY);
  });
});
