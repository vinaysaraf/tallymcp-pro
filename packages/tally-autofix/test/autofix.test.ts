import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants } from "node:fs";
import { TallyAutofixer } from "../src/autofix.js";
import { FakeExecRunner } from "../src/exec-runner.js";

describe("TallyAutofixer.fixXmlInterface", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "autofix-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("backs up tally.ini, sets the two server lines, and verifies", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\nLoad=10002\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner(() => ({
      exitCode: 0, stdout: "INFO: No tasks are running", stderr: "",
    }));
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.fixXmlInterface({
      installDir, exePath: join(installDir, "tally.exe"), iniPath,
    });

    expect(result.iniBackupCreated).toBe(true);
    await access(`${iniPath}.tallymcp-bak`, constants.F_OK);

    const after = await readFile(iniPath, "utf8");
    expect(after).toContain("Client Server=Both");
    expect(after).toContain("ServerPort=9000");
    expect(after).toContain("Default Companies=Yes");

    // Atomic write must not leave a .tmp behind.
    const entries = await readdir(installDir);
    expect(entries.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("returns noop when tally.ini already has Client Server=Both + ServerPort=9000", async () => {
    const installDir = join(root, "TallyPrime");
    await mkdir(installDir);
    const iniPath = join(installDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nClient Server=Both\nServerPort=9000\n");
    await writeFile(join(installDir, "tally.exe"), "");

    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.fixXmlInterface({
      installDir, exePath: join(installDir, "tally.exe"), iniPath,
    });
    expect(result.action).toBe("noop");
  });
});

describe("TallyAutofixer.ensureFirewallRule", () => {
  it("returns 'added' on success", async () => {
    const runner = new FakeExecRunner((_cmd, args) => {
      // show rule → not found; add rule → success
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      return { exitCode: 0, stdout: "Ok.", stderr: "" };
    });
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.ensureFirewallRule("C:\\TallyPrime\\tally.exe");
    expect(result).toBe("added");
  });

  it("returns 'skipped-non-admin' when netsh fails with empty stderr (non-admin)", async () => {
    const runner = new FakeExecRunner((_cmd, args) => {
      // show rule → not found; add rule → elevation failure (exit 1, empty stderr)
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match.", stderr: "" };
      // add rule → fails silently (elevation required)
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.ensureFirewallRule("C:\\TallyPrime\\tally.exe");
    expect(result).toBe("skipped-non-admin");
  });
});

describe("TallyAutofixer.restoreTallyIni", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "autofix-restore-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("copies .tallymcp-bak back over the live file", async () => {
    const iniPath = join(root, "tally.ini");
    await writeFile(`${iniPath}.tallymcp-bak`, "ORIGINAL CONTENT");
    await writeFile(iniPath, "MODIFIED CONTENT");

    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    const fixer = new TallyAutofixer({ runner });
    await fixer.restoreTallyIni(iniPath);

    expect(await readFile(iniPath, "utf8")).toBe("ORIGINAL CONTENT");
  });
});
