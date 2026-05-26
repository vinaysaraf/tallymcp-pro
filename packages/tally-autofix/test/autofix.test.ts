import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants } from "node:fs";
import { TallyAutofixer, TallyIniLockedError } from "../src/autofix.js";
import { FakeExecRunner } from "../src/exec-runner.js";

// Mock writeAtomic at MODULE scope (Cursor H2): vi.spyOn on the imported
// module object doesn't intercept a static named import in autofix.ts
// because ESM binds the reference at module-load time. vi.mock with a
// factory + state-bag REPLACES the module before autofix.ts is loaded.
const writeAtomicState: {
  nextError?: NodeJS.ErrnoException;
  callCount: number;
} = { callCount: 0 };

vi.mock("../src/atomic-write.js", () => ({
  writeAtomic: vi.fn(async (path: string, content: string) => {
    writeAtomicState.callCount++;
    if (writeAtomicState.nextError) {
      const err = writeAtomicState.nextError;
      writeAtomicState.nextError = undefined;
      throw err;
    }
    // Default behavior: actually write (the test still wants the happy
    // path tests in the existing describes to work). Use node:fs/promises
    // directly since we've replaced the wrapper.
    const { writeFile: realWriteFile } = await import("node:fs/promises");
    await realWriteFile(path, content, "utf8");
  }),
}));

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

describe("TallyAutofixer.removeFirewallRuleIfPresent", () => {
  it("returns 'noop' when the rule doesn't exist", async () => {
    const runner = new FakeExecRunner((_cmd, args) => {
      // show rule → not found
      if (args.includes("show")) return { exitCode: 1, stdout: "No rules match the specified criteria.", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.removeFirewallRuleIfPresent();
    expect(result).toBe("noop");
  });

  it("returns 'removed' on success", async () => {
    const runner = new FakeExecRunner((_cmd, args) => {
      // show rule → rule present
      if (args.includes("show")) return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000\nOk.", stderr: "" };
      // delete rule → success
      return { exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" };
    });
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.removeFirewallRuleIfPresent();
    expect(result).toBe("removed");
  });

  it("returns 'skipped-non-admin' on elevation failure", async () => {
    const runner = new FakeExecRunner((_cmd, args) => {
      // show rule → rule present
      if (args.includes("show")) return { exitCode: 0, stdout: "Rule Name: TallyMCP — Tally XML port 9000\nOk.", stderr: "" };
      // delete rule → elevation failure (exit 1, empty stderr)
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const fixer = new TallyAutofixer({ runner });
    const result = await fixer.removeFirewallRuleIfPresent();
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

describe("fixXmlInterface — EPERM/EACCES handling", () => {
  beforeEach(() => {
    writeAtomicState.nextError = undefined;
    writeAtomicState.callCount = 0;
  });

  it("throws TallyIniLockedError when the write fails with EPERM (Tally running or non-admin on Program Files)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "tallymcp-perm-"));
    const iniPath = join(tmpDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\nDefault Companies=Yes\n", "utf8");

    const epermErr = new Error("EPERM: operation not permitted, rename") as NodeJS.ErrnoException;
    epermErr.code = "EPERM";
    writeAtomicState.nextError = epermErr;

    const fixer = new TallyAutofixer({ runner: new FakeExecRunner(() => ({
      exitCode: 0, stdout: "", stderr: "",
    })) });
    const install = {
      installDir: tmpDir,
      exePath: join(tmpDir, "tally.exe"),
      iniPath,
    };

    try {
      await expect(fixer.fixXmlInterface(install)).rejects.toBeInstanceOf(TallyIniLockedError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws TallyIniLockedError with a CA-friendly message on EACCES", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "tallymcp-acc-"));
    const iniPath = join(tmpDir, "tally.ini");
    await writeFile(iniPath, "[TALLY]\n", "utf8");

    const eaccErr = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
    eaccErr.code = "EACCES";
    writeAtomicState.nextError = eaccErr;

    const fixer = new TallyAutofixer({ runner: new FakeExecRunner(() => ({
      exitCode: 0, stdout: "", stderr: "",
    })) });
    const install = {
      installDir: tmpDir,
      exePath: join(tmpDir, "tally.exe"),
      iniPath,
    };

    try {
      await fixer.fixXmlInterface(install);
      throw new Error("expected fixXmlInterface to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TallyIniLockedError);
      const msg = (err as Error).message;
      expect(msg).toMatch(/TallyPrime is currently running/i);
      expect(msg).toMatch(/run TallyMCP as Administrator/i);
      expect(msg).toContain(iniPath);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
