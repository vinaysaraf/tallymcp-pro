import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWireCommand } from "../src/commands/wire.js";

describe("wire CLI", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wire-cli-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("wires Claude Desktop using the resolved paths from --install-dir", async () => {
    const installDir = join(dir, "TallyMCP");
    const appdata = join(dir, "appdata");
    const result = await runWireCommand({
      clientId: "claude-desktop",
      installDir,
      env: { APPDATA: appdata },
    });
    expect(result.action).toBe("added");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toEqual({
      command: join(installDir, "node.exe"),
      args: [join(installDir, "mcp-server", "main.js")],
      env: { TALLYMCP_CONFIG: join(installDir, "config.json") },
    });
  });
});
