import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeExecRunner, type ExecResult } from "@tallymcp/tally-autofix";
import { handleHealthCheck } from "../../src/main/ipc-handlers.js";

describe("handleHealthCheck — MSIX/Store Claude Desktop detection (#140)", () => {
  let dir: string;
  let runner: FakeExecRunner;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ipc-msix-"));
    runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 1,
      stdout: "",
      stderr: "",
    }));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("detects claude-desktop as configured when tallymcp-pro entry is in MSIX-sandboxed config", async () => {
    const localAppData = join(dir, "Local");
    const msixConfigDir = join(
      localAppData,
      "Packages",
      "Claude_test12345",
      "LocalCache",
      "Roaming",
      "Claude",
    );
    await mkdir(msixConfigDir, { recursive: true });
    await writeFile(
      join(msixConfigDir, "claude_desktop_config.json"),
      JSON.stringify({
        mcpServers: { "tallymcp-pro": { command: "node.exe", args: [] } },
      }),
    );

    const env = {
      APPDATA: join(dir, "Roaming"),
      LOCALAPPDATA: localAppData,
    };

    const result = await handleHealthCheck({
      runner,
      env,
      scanRoots: [join(dir, "no-tally")],
    });

    expect(result.configuredClients).toContain("claude-desktop");
  });

  it("populates claudeDesktopVariants with 'msix' when only the MSIX folder exists", async () => {
    const localAppData = join(dir, "Local");
    await mkdir(
      join(localAppData, "Packages", "Claude_test12345", "LocalCache", "Roaming", "Claude"),
      { recursive: true },
    );

    const env = {
      APPDATA: join(dir, "Roaming"),
      LOCALAPPDATA: localAppData,
    };

    const result = await handleHealthCheck({
      runner,
      env,
      scanRoots: [join(dir, "no-tally")],
    });

    expect(result.claudeDesktopVariants).toEqual(["msix"]);
  });

  it("populates claudeDesktopVariants with both 'standard' and 'msix' when both folders exist", async () => {
    const appData = join(dir, "Roaming");
    const localAppData = join(dir, "Local");
    await mkdir(join(appData, "Claude"), { recursive: true });
    await mkdir(
      join(localAppData, "Packages", "Claude_test12345", "LocalCache", "Roaming", "Claude"),
      { recursive: true },
    );

    const env = { APPDATA: appData, LOCALAPPDATA: localAppData };

    const result = await handleHealthCheck({
      runner,
      env,
      scanRoots: [join(dir, "no-tally")],
    });

    expect([...(result.claudeDesktopVariants ?? [])].sort()).toEqual(["msix", "standard"]);
  });

  it("returns ['standard'] when neither folder exists (first-run fallback)", async () => {
    const env = {
      APPDATA: join(dir, "Roaming"),
      LOCALAPPDATA: join(dir, "Local"),
    };

    const result = await handleHealthCheck({
      runner,
      env,
      scanRoots: [join(dir, "no-tally")],
    });

    expect(result.claudeDesktopVariants).toEqual(["standard"]);
  });
});
