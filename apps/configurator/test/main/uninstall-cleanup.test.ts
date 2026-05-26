import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUninstallCleanup } from "../../src/main/uninstall-cleanup.js";
import { FakeExecRunner, type ExecResult } from "@tallymcp/tally-autofix";

describe("runUninstallCleanup", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-uninstall-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes tallymcp-pro from each AI client config that contains it", async () => {
    const appdata = join(dir, "appdata");
    await mkdir(join(appdata, "Claude"), { recursive: true });
    await writeFile(
      join(appdata, "Claude", "claude_desktop_config.json"),
      JSON.stringify(
        { mcpServers: { "tallymcp-pro": { command: "x", args: [] }, "other": { command: "y" } } },
        null,
        2,
      ),
    );

    const runner = new FakeExecRunner((cmd, args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await runUninstallCleanup({
      env: { APPDATA: appdata },
      scanRoots: [dir],
      runner,
    });

    const config = JSON.parse(
      await readFile(join(appdata, "Claude", "claude_desktop_config.json"), "utf8"),
    );
    expect(config.mcpServers["tallymcp-pro"]).toBeUndefined();
    expect(config.mcpServers["other"]).toBeDefined();
    expect(result.clientsUnwired).toContain("claude-desktop");
  });

  it("restores tally.ini from .tallymcp-bak when present", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "MODIFIED");
    await writeFile(join(installDir, "tally.ini.tallymcp-bak"), "ORIGINAL");

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "No rules match", stderr: "" };
    });

    const result = await runUninstallCleanup({
      env: { APPDATA: join(dir, "no-appdata") },
      scanRoots: [dir],
      runner,
    });

    expect(await readFile(join(installDir, "tally.ini"), "utf8")).toBe("ORIGINAL");
    expect(result.tallyIniRestored).toBe(true);
  });

  it("never throws — returns a structured result even when everything fails", async () => {
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 1,
      stdout: "",
      stderr: "everything broke",
    }));

    const result = await runUninstallCleanup({
      env: { APPDATA: join(dir, "missing") },
      scanRoots: [join(dir, "no-tally-here")],
      runner,
    });

    expect(result.clientsUnwired).toEqual([]);
    expect(result.tallyIniRestored).toBe(false);
    expect(result.firewallRule).toMatch(/noop|skipped/);
  });

  it("removes the firewall rule when present + admin", async () => {
    const runner = new FakeExecRunner((cmd, args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      if (args.includes("show")) {
        return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000", stderr: "" };
      }
      if (args.includes("delete")) {
        return { exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await runUninstallCleanup({
      env: { APPDATA: join(dir, "missing") },
      scanRoots: [join(dir, "no-tally-here")],
      runner,
    });

    expect(result.firewallRule).toBe("removed");
  });
});
