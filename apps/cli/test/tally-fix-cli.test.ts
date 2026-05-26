import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTallyFixCommand } from "../src/commands/tally-fix.js";
import { FakeExecRunner } from "@tallymcp/tally-autofix";
import { AbortError } from "../src/confirm.js";

describe("tally-fix CLI", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tally-fix-cli-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("applies XML interface fix + adds firewall rule when both missing", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      // tasklist → no Tally; firewall show → no rule; firewall add → ok
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });

    const result = await runTallyFixCommand({
      scanRoots: [root],
      runner,
      yes: true,
    });

    expect(result.xmlInterface).toBe("applied");
    expect(result.firewallRule).toBe("added");
    expect(await readFile(iniPath, "utf8")).toContain("Client Server=Both");
  });

  it("errors with --tally-dir hint when multiple installs are found", async () => {
    await mkdir(join(root, "TallyPrime"));
    await writeFile(join(root, "TallyPrime", "tally.exe"), "");
    await writeFile(join(root, "TallyPrime", "tally.ini"), "[TALLY]\n");
    await mkdir(join(root, "TallyPrime (1)"));
    await writeFile(join(root, "TallyPrime (1)", "tally.exe"), "");
    await writeFile(join(root, "TallyPrime (1)", "tally.ini"), "[TALLY]\n");

    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    await expect(
      runTallyFixCommand({ scanRoots: [root], runner, yes: true }),
    ).rejects.toThrow(/Multiple TallyPrime installs found.*--tally-dir/);
  });

  it("uses --tally-dir override when provided", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks", stderr: "" };
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });

    const result = await runTallyFixCommand({ tallyDir: installDir, runner, yes: true });
    expect(result.install.installDir).toBe(installDir);
    expect(result.xmlInterface).toBe("applied");
  });

  it("returns firewallRule='skipped-non-admin' when running non-admin", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      // firewall show → no rule
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      // firewall add → elevation failure (exit 1, empty stderr)
      if (args.includes("add")) return { exitCode: 1, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });

    const result = await runTallyFixCommand({
      tallyDir: installDir,
      runner,
      yes: true,
    });

    expect(result.firewallRule).toBe("skipped-non-admin");
    expect(result.xmlInterface).toBe("applied");
    expect(await readFile(iniPath, "utf8")).toContain("Client Server=Both");
  });

  it("returns firewallRule='group-policy-blocked' when netsh stderr mentions Group Policy (Cursor N-R3-3)", async () => {
    // Locks in the apps/cli/src/main.ts hotfix (commit ebb64f7) by exercising
    // the underlying library outcome the CLI now branches on. Before the
    // hotfix the CLI's local TallyFixResult.firewallRule union was narrower
    // than the library returned, so this outcome would have been a TS error;
    // and the printed CLI output silently used the success branch.
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      if (args.includes("add")) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "The configuration is not allowed by the Group Policy configured on this computer.",
        };
      }
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });

    const result = await runTallyFixCommand({
      tallyDir: installDir,
      runner,
      yes: true,
    });

    expect(result.firewallRule).toBe("group-policy-blocked");
    expect(result.xmlInterface).toBe("applied");
  });

  it("aborts when confirmFn returns false", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    const originalContent = "[TALLY]\nDefault Companies=Yes\n";
    await writeFile(iniPath, originalContent);
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });

    // Simulate a TTY so assertInteractiveOrYes passes, reaching confirmFn.
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await expect(
      runTallyFixCommand({
        tallyDir: installDir,
        runner,
        yes: false,
        confirmFn: async () => false,
      }),
    ).rejects.toThrow(AbortError);
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });

    // Verify tally.ini was not modified
    expect(await readFile(iniPath, "utf8")).toBe(originalContent);
  });
});
