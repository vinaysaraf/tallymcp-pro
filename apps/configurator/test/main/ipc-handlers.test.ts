import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleWireMcp, handleUnwireMcp } from "../../src/main/ipc-handlers.js";

describe("handleWireMcp", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-wire-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("wires Claude Desktop via @tallymcp/client-wirer", async () => {
    const installDir = join(dir, "TallyMCP");
    const env = { APPDATA: join(dir, "appdata") };

    const result = await handleWireMcp(
      { clientId: "claude-desktop", installDir },
      { env },
    );

    expect(result.action).toBe("added");
    expect(result.clientId).toBe("claude-desktop");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"].command).toBe(
      join(installDir, "node.exe"),
    );
  });
});

describe("handleUnwireMcp", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-unwire-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes the tallymcp-pro entry surgically", async () => {
    const installDir = join(dir, "TallyMCP");
    const env = { APPDATA: join(dir, "appdata") };

    await handleWireMcp({ clientId: "claude-desktop", installDir }, { env });

    const result = await handleUnwireMcp({ clientId: "claude-desktop" }, { env });

    expect(result.action).toBe("removed");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toBeUndefined();
  });
});
