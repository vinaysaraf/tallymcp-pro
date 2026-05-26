import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWireCommand } from "../src/commands/wire.js";
import { AbortError } from "../src/confirm.js";

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
      yes: true,
    });
    expect(result.action).toBe("added");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toEqual({
      command: join(installDir, "node.exe"),
      args: [join(installDir, "mcp-server", "main.js")],
      env: { TALLYMCP_CONFIG: join(installDir, "config.json") },
    });
  });

  it("aborts when confirmFn returns false", async () => {
    const installDir = join(dir, "TallyMCP");
    const appdata = join(dir, "appdata");
    const configPath = join(appdata, "Claude", "claude_desktop_config.json");

    // Simulate a TTY so assertInteractiveOrYes passes, reaching confirmFn.
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await expect(
      runWireCommand({
        clientId: "claude-desktop",
        installDir,
        env: { APPDATA: appdata },
        yes: false,
        confirmFn: async () => false,
      }),
    ).rejects.toThrow(AbortError);
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });

    // Verify no file was written
    await expect(readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("preview entry snippet is valid JSON with properly escaped paths", async () => {
    const installDir = join(dir, "TallyMCP");
    const appdata = join(dir, "appdata");

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown, ...rest: unknown[]) => {
      chunks.push(String(chunk));
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    };
    try {
      await runWireCommand({
        clientId: "claude-desktop",
        installDir,
        env: { APPDATA: appdata },
        yes: true,
      });
    } finally {
      process.stdout.write = origWrite;
    }

    const allOutput = chunks.join("");
    // The snippet is indented JSON — find the outermost { ... } block in the preview.
    const match = allOutput.match(/\{[\s\S]*\}/);
    expect(match).not.toBeNull();
    const parsed: Record<string, unknown> = JSON.parse(match![0].trim());
    expect(parsed).toHaveProperty("tallymcp-pro");
  });

  it("does not call confirmFn when yes: true", async () => {
    const installDir = join(dir, "TallyMCP");
    const appdata = join(dir, "appdata");
    const spyFn = vi.fn().mockRejectedValue(new Error("confirmFn should not be called"));

    const result = await runWireCommand({
      clientId: "claude-desktop",
      installDir,
      env: { APPDATA: appdata },
      yes: true,
      confirmFn: spyFn,
    });

    expect(spyFn).not.toHaveBeenCalled();
    expect(result.action).toBe("added");
  });
});
