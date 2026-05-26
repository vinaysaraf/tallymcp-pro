import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTallyRestoreCommand } from "../src/commands/tally-restore.js";
import { FakeExecRunner } from "@tallymcp/tally-autofix";
import { AbortError } from "../src/confirm.js";

describe("tally-restore CLI", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tally-restore-cli-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("restores tally.ini from .tallymcp-bak and removes the firewall rule", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "MODIFIED");
    await writeFile(`${iniPath}.tallymcp-bak`, "ORIGINAL");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      // firewall show → rule present; firewall delete → success
      if (args.includes("show")) return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000\nOk.", stderr: "" };
      return { exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" };
    });

    const result = await runTallyRestoreCommand({ scanRoots: [root], runner, yes: true });

    expect(await readFile(iniPath, "utf8")).toBe("ORIGINAL");
    expect(result.iniRestored).toBe(true);
    expect(result.firewallRule).toBe("removed");
  });

  it("returns firewallRule='skipped-non-admin' when delete fails with empty stderr", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "MODIFIED");
    await writeFile(`${iniPath}.tallymcp-bak`, "ORIGINAL");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      // firewall show → rule present; firewall delete → elevation failure
      if (args.includes("show")) return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000\nOk.", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const result = await runTallyRestoreCommand({ scanRoots: [root], runner, yes: true });

    // tally.ini must still be restored even when firewall removal is skipped
    expect(await readFile(iniPath, "utf8")).toBe("ORIGINAL");
    expect(result.iniRestored).toBe(true);
    expect(result.firewallRule).toBe("skipped-non-admin");
  });

  it("aborts when confirmFn returns false", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "MODIFIED");
    await writeFile(`${iniPath}.tallymcp-bak`, "ORIGINAL");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner((cmd, _args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      return { exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" };
    });

    // Simulate a TTY so assertInteractiveOrYes passes, reaching confirmFn.
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await expect(
      runTallyRestoreCommand({
        tallyDir: installDir,
        runner,
        yes: false,
        confirmFn: async () => false,
      }),
    ).rejects.toThrow(AbortError);
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });

    // Verify tally.ini was not restored (still has MODIFIED content)
    expect(await readFile(iniPath, "utf8")).toBe("MODIFIED");
  });
});
