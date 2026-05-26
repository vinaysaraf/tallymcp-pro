import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleWireMcp, handleUnwireMcp, handleHealthCheck, handleTallyFix, handleTallyRestore, handleGetConfig } from "../../src/main/ipc-handlers.js";
import { FakeExecRunner, type ExecResult } from "@tallymcp/tally-autofix";

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
      { clientId: "claude-desktop" },
      { env, installDir },
    );

    expect(result.action).toBe("added");
    expect(result.clientId).toBe("claude-desktop");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"].command).toBe(
      join(installDir, "node.exe"),
    );
    expect(written.mcpServers["tallymcp-pro"].args).toEqual([
      join(installDir, "mcp-server", "dist", "main.js"),
    ]);
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

    await handleWireMcp({ clientId: "claude-desktop" }, { env, installDir });

    const result = await handleUnwireMcp({ clientId: "claude-desktop" }, { env });

    expect(result.action).toBe("removed");
    const written = JSON.parse(await readFile(result.configPath, "utf8"));
    expect(written.mcpServers["tallymcp-pro"]).toBeUndefined();
  });
});

describe("handleHealthCheck", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-health-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports all-good when Tally is installed + running + XML on + firewall present", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(
      join(installDir, "tally.ini"),
      "[TALLY]\nClient Server=Both\nServerPort=9000\n",
    );

    const runner = new FakeExecRunner((cmd, args): ExecResult => {
      if (cmd === "tasklist") {
        return { exitCode: 0, stdout: "tally.exe 1 Console", stderr: "" };
      }
      if (args.includes("show")) {
        return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unknown" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });

    expect(result.tallyInstalled).toBe(true);
    expect(result.tallyRunning).toBe(true);
    expect(result.xmlInterfaceEnabled).toBe(true);
    expect(result.firewallRulePresent).toBe(true);
    expect(result.tallyInstallDir).toBe(installDir);
  });

  it("reports tallyInstalled=false when no TallyPrime folder exists", async () => {
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 0,
      stdout: "INFO: No tasks are running",
      stderr: "",
    }));

    const result = await handleHealthCheck({ scanRoots: [dir], runner });

    expect(result.tallyInstalled).toBe(false);
    expect(result.tallyRunning).toBe(false);
  });

  it("reports xmlInterfaceEnabled=false when tally.ini lacks the lines", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\nDefault Companies=Yes\n");

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "No rules match", stderr: "" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });

    expect(result.tallyInstalled).toBe(true);
    expect(result.xmlInterfaceEnabled).toBe(false);
    expect(result.firewallRulePresent).toBe(false);
  });

  it("reports configuredClients when claude_desktop_config.json has tallymcp-pro", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\n");

    const appdata = join(dir, "appdata");
    await mkdir(join(appdata, "Claude"), { recursive: true });
    await writeFile(
      join(appdata, "Claude", "claude_desktop_config.json"),
      JSON.stringify({ mcpServers: { "tallymcp-pro": { command: "x", args: [] } } }),
    );

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "No rules match", stderr: "" };
    });

    const result = await handleHealthCheck({
      scanRoots: [dir],
      runner,
      env: { APPDATA: appdata },
    });

    expect(result.configuredClients).toEqual(["claude-desktop"]);
  });

  it("reports multipleTallyInstalls when more than one folder matches", async () => {
    const a = join(dir, "TallyPrime");
    const b = join(dir, "TallyPrime (1)");
    await mkdir(a);
    await mkdir(b);
    await writeFile(join(a, "tally.exe"), "");
    await writeFile(join(a, "tally.ini"), "");
    await writeFile(join(b, "tally.exe"), "");
    await writeFile(join(b, "tally.ini"), "");

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "No rules match", stderr: "" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.multipleTallyInstalls).toEqual([a, b]);
  });

  it("populates isElevated from detectIsElevated (true when net session exit 0)", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\n");

    const runner = new FakeExecRunner((cmd, args): ExecResult => {
      if (cmd === "net" && args[0] === "session") {
        return { exitCode: 0, stdout: "There are no entries.", stderr: "" };
      }
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.isElevated).toBe(true);
  });

  it("populates isElevated=false when net session exits non-zero", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\n");

    const runner = new FakeExecRunner((cmd, args): ExecResult => {
      if (cmd === "net" && args[0] === "session") {
        return { exitCode: 2, stdout: "", stderr: "Access is denied." };
      }
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.isElevated).toBe(false);
  });
});

describe("handleTallyFix", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-fix-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("applies tally.ini changes + skips firewall gracefully on non-admin", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\nDefault Companies=Yes\n");

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      // netsh add returns the elevation signature (exit 1, empty stderr)
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await handleTallyFix({ scanRoots: [dir], runner });

    expect(result.xmlInterface).toBe("applied");
    expect(result.iniBackupCreated).toBe(true);
    expect(result.firewallRule).toBe("skipped-non-admin");
  });
});

describe("handleTallyRestore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-restore-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("restores tally.ini from .tallymcp-bak and reports firewall noop", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "MODIFIED");
    await writeFile(join(installDir, "tally.ini.tallymcp-bak"), "ORIGINAL");

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      // show rule → no rule exists
      return { exitCode: 1, stdout: "No rules match", stderr: "" };
    });

    const result = await handleTallyRestore({ scanRoots: [dir], runner });

    expect(result.iniRestored).toBe(true);
    expect(result.firewallRule).toBe("noop");
    expect(await readFile(join(installDir, "tally.ini"), "utf8")).toBe("ORIGINAL");
  });
});

describe("handleGetConfig", () => {
  it("returns the installDir + version + best-effort tallyInstallDir", async () => {
    const cfg = await handleGetConfig({
      installDir: "C:\\X\\TallyMCP",
      version: "0.0.1",
      scanRoots: ["C:\\nonexistent"],
    });

    expect(cfg.installDir).toBe("C:\\X\\TallyMCP");
    expect(cfg.version).toBe("0.0.1");
    expect(cfg.tallyInstallDir).toBeUndefined();
  });
});
