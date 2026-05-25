import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTallyRestoreCommand } from "../src/commands/tally-restore.js";
import { FakeExecRunner } from "@tallymcp/tally-autofix";

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

    await runTallyRestoreCommand({ scanRoots: [root], runner });

    expect(await readFile(iniPath, "utf8")).toBe("ORIGINAL");
  });
});
