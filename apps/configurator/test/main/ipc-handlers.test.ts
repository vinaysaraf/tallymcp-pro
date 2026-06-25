import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleWireMcp, handleUnwireMcp, handleHealthCheck, handleTallyFix, handleTallyRestore, handleGetConfig, handleSetTallyConnection, readTallyConnection, tallyUrlFromConfig } from "../../src/main/ipc-handlers.js";
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
    expect(written.mcpServers["tallymcp-pro"].args[0]).toContain("main.bundle.js");
    expect(written.mcpServers["tallymcp-pro"].args[0]).not.toContain("dist");
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

  it("surfaces Tally Gateway Server when present in tally.ini (#129)", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(
      join(installDir, "tally.ini"),
      "[TALLY]\nDefault Companies=Yes\nTally Gateway Server=PAKHI:9999\nClient Server=Both\n",
    );

    const runner = new FakeExecRunner((cmd, _args): ExecResult => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.tallyGatewayServer).toBe("PAKHI:9999");
  });

  it("leaves tallyGatewayServer undefined when not present in tally.ini", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(join(installDir, "tally.ini"), "[TALLY]\nClient Server=Both\n");

    const runner = new FakeExecRunner(() => ({ exitCode: 1, stdout: "", stderr: "" }));
    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.tallyGatewayServer).toBeUndefined();
  });

  it("tolerates whitespace + casing variations in Tally Gateway Server line", async () => {
    const installDir = join(dir, "TallyPrime");
    await mkdir(installDir);
    await writeFile(join(installDir, "tally.exe"), "");
    await writeFile(
      join(installDir, "tally.ini"),
      "[TALLY]\n  tally gateway server  =  somehost:1234  \n",
    );

    const runner = new FakeExecRunner(() => ({ exitCode: 1, stdout: "", stderr: "" }));
    const result = await handleHealthCheck({ scanRoots: [dir], runner });
    expect(result.tallyGatewayServer).toBe("somehost:1234");
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

  it("defaults the Tally connection to this-PC when no config.json exists", async () => {
    const cfg = await handleGetConfig({
      installDir: "C:\\X\\TallyMCP-missing",
      version: "0.0.1",
      scanRoots: ["C:\\nonexistent"],
    });
    expect(cfg.tallyHost).toBe("127.0.0.1");
    expect(cfg.tallyPort).toBe(9000);
    expect(cfg.tallyConnectionType).toBe("local");
  });
});

describe("Tally connection (set / read / url)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "configurator-ipc-conn-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists a Server connection and reads it back, preserving other config", async () => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    // Pre-existing config with an unrelated field that must survive the write.
    await writeFile(
      join(installDir, "config.json"),
      JSON.stringify({ schemaVersion: 1, tally: { defaultCompany: "ACME", connections: [] } }, null, 2),
      "utf8",
    );

    const snap = await handleSetTallyConnection(
      { host: "192.168.1.50", port: 9000 },
      { installDir, version: "1.0.18", scanRoots: ["C:\\nonexistent"] },
    );
    expect(snap.tallyHost).toBe("192.168.1.50");
    expect(snap.tallyPort).toBe(9000);
    expect(snap.tallyConnectionType).toBe("server");

    const conn = await readTallyConnection(installDir);
    expect(conn).toEqual({ host: "192.168.1.50", port: 9000, type: "server" });

    // Unrelated field preserved.
    const written = JSON.parse(await readFile(join(installDir, "config.json"), "utf8"));
    expect(written.tally.defaultCompany).toBe("ACME");
    expect(written.tally.connections).toEqual([
      { host: "192.168.1.50", port: 9000, type: "server", default: true },
    ]);
  });

  it("marks a loopback host as a local connection", async () => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    const snap = await handleSetTallyConnection(
      { host: "127.0.0.1", port: 9000 },
      { installDir, version: "1.0.18" },
    );
    expect(snap.tallyConnectionType).toBe("local");
  });

  it("tallyUrlFromConfig builds http://host:port from the saved connection", async () => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    await handleSetTallyConnection({ host: "10.0.0.7", port: 9001 }, { installDir, version: "1.0.18" });
    expect(await tallyUrlFromConfig(installDir)).toBe("http://10.0.0.7:9001");
  });

  it("rejects an out-of-range port", async () => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    await expect(
      handleSetTallyConnection({ host: "192.168.1.50", port: 70000 }, { installDir, version: "1.0.18" }),
    ).rejects.toThrow(/between 1 and 65535/);
  });

  it("rejects an empty host", async () => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    await expect(
      handleSetTallyConnection({ host: "   ", port: 9000 }, { installDir, version: "1.0.18" }),
    ).rejects.toThrow(/host can't be empty/i);
  });

  // Codex iter-1: the host must be a bare hostname/IPv4 — anything that would
  // change the endpoint when interpolated into `http://${host}:${port}` is
  // rejected, so the validated host:port is the ACTUAL endpoint reached.
  it.each([
    "http://tally-server",
    "https://tally-server",
    "tally-server/path",
    "tally-server?x=y",
    "tally-server#frag",
    "host:9001",
    "user@host",
    "::1",
    "[::1]",
    "192.168.1.50 9000",
  ])("rejects URL-ish / unsafe host %j (never silently redirects traffic)", async (badHost) => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    await expect(
      handleSetTallyConnection({ host: badHost, port: 9000 }, { installDir, version: "1.0.18" }),
    ).rejects.toThrow(/isn't a valid Tally host/i);
    // Nothing was written.
    expect(existsSync(join(installDir, "config.json"))).toBe(false);
  });

  it.each([
    ["192.168.1.50", "server"],
    ["tally-server", "server"],
    ["tally.office.local", "server"],
    ["127.0.0.1", "local"],
    ["localhost", "local"],
  ])("accepts bare host %j and classifies it as %s", async (goodHost, expectedType) => {
    const installDir = join(dir, "TallyMCP");
    await mkdir(installDir, { recursive: true });
    const snap = await handleSetTallyConnection(
      { host: goodHost, port: 9000 },
      { installDir, version: "1.0.18" },
    );
    expect(snap.tallyHost).toBe(goodHost);
    expect(snap.tallyConnectionType).toBe(expectedType);
  });
});
