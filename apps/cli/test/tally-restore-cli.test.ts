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

    const runner = new FakeExecRunner((cmd, _args) => {
      if (cmd === "tasklist") return { exitCode: 0, stdout: "INFO: No tasks are running", stderr: "" };
      // firewall delete → success
      return { exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" };
    });

    await runTallyRestoreCommand({ scanRoots: [root], runner, yes: true });

    expect(await readFile(iniPath, "utf8")).toBe("ORIGINAL");
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

    await expect(
      runTallyRestoreCommand({
        tallyDir: installDir,
        runner,
        yes: false,
        confirmFn: async () => false,
      }),
    ).rejects.toThrow(AbortError);

    // Verify tally.ini was not restored (still has MODIFIED content)
    expect(await readFile(iniPath, "utf8")).toBe("MODIFIED");
  });
});
