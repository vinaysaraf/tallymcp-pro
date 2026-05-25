import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClientWirer } from "../src/wirer.js";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ClientWirer — Ollama uses 'servers' key, not 'mcpServers'", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wirer-ollama-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes under the 'servers' key for Ollama", async () => {
    const env = { LOCALAPPDATA: join(dir, "local") };
    const wirer = new ClientWirer({
      env,
      entry: { command: "node.exe", args: ["main.js"] },
    });
    const result = await wirer.add("ollama");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.servers?.["tallymcp-pro"]).toBeDefined();
    expect(written.mcpServers).toBeUndefined();
  });
});
