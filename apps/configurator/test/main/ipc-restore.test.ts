import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleWireMcp, handleRestoreMcp, handleHealthCheck } from "../../src/main/ipc-handlers.js";
import { FakeExecRunner, type ExecResult } from "@tallymcp/tally-autofix";

describe("handleRestoreMcp", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-restore-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("restores the most recent backup after a re-wire", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const installDir1 = join(dir, "TallyMCP");
    const installDir2 = join(dir, "TallyMCP2");

    // First wire creates the file; second wire (different entry) snapshots it.
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: installDir1 });
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: installDir2 });

    const result = await handleRestoreMcp({ clientId: "claude-desktop" }, { env });

    expect(result.action).toBe("restored");
    expect(result.restoredFromISO).toBeDefined();
    // Restored to the first wire's entry (pointing at installDir1).
    const written = JSON.parse(await readFile(result.configPaths[0]!, "utf8"));
    expect(written.mcpServers["tallymcp-pro"].command).toBe(join(installDir1, "node.exe"));
  });

  it("returns noop when no backup exists", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    const result = await handleRestoreMcp({ clientId: "claude-desktop" }, { env });
    expect(result.action).toBe("noop");
    expect(result.restoredFromISO).toBeUndefined();
  });

  // Codex regression: Reset must be reachable in the recovery case. healthCheck
  // must report a client as restorable when a backup exists, even if its live
  // config is no longer "configured".
  it("healthCheck reports restorableClients when a backup exists", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    // Create a backup by wiring then re-wiring (different entry).
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: join(dir, "TallyMCP") });
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: join(dir, "TallyMCP2") });

    const runner = new FakeExecRunner((): ExecResult => ({
      exitCode: 0,
      stdout: "INFO: No tasks are running",
      stderr: "",
    }));
    const health = await handleHealthCheck({ scanRoots: [join(dir, "no-tally")], runner, env });

    expect(health.restorableClients).toContain("claude-desktop");
  });

  // Cursor follow-up: true mock-free proof of the recovery scenario — when the
  // LIVE config is corrupted (unparseable, as Claude leaves it), the client is
  // NOT "configured" yet IS "restorable", and restore brings it back.
  it("corrupted live config: excluded from configuredClients but still restorable + recoverable", async () => {
    const env = { APPDATA: join(dir, "appdata") };
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: join(dir, "TallyMCP") });
    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir: join(dir, "TallyMCP2") });

    // Simulate Claude's concatenated-JSON corruption on the live file.
    const cfgPath = join(env.APPDATA, "Claude", "claude_desktop_config.json");
    await writeFile(cfgPath, '{ "mcpServers": {} }\n{ broken');

    const runner = new FakeExecRunner((): ExecResult => ({
      exitCode: 0,
      stdout: "INFO: No tasks are running",
      stderr: "",
    }));
    const health = await handleHealthCheck({ scanRoots: [join(dir, "no-tally")], runner, env });
    expect(health.configuredClients).not.toContain("claude-desktop"); // unparseable → not configured
    expect(health.restorableClients).toContain("claude-desktop"); // backup exists → recoverable

    const restore = await handleRestoreMcp({ clientId: "claude-desktop" }, { env });
    expect(restore.action).toBe("restored");
    // Live config is valid JSON again with our entry restored.
    const recovered = JSON.parse(await readFile(cfgPath, "utf8"));
    expect(recovered.mcpServers["tallymcp-pro"]).toBeDefined();
  });
});
