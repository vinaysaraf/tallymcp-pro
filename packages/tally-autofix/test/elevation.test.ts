import { describe, it, expect } from "vitest";
import { detectIsElevated } from "../src/elevation.js";
import { FakeExecRunner, type ExecResult } from "../src/exec-runner.js";

describe("detectIsElevated", () => {
  it("returns true when `net session` exits 0 (admin context)", async () => {
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 0,
      stdout: "There are no entries in the list.",
      stderr: "",
    }));
    expect(await detectIsElevated(runner)).toBe(true);
  });

  it("returns false when `net session` exits 2 (Access denied — non-admin)", async () => {
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 2,
      stdout: "",
      stderr: "System error 5 has occurred. Access is denied.",
    }));
    expect(await detectIsElevated(runner)).toBe(false);
  });

  it("returns false when the command throws (net.exe missing, unusual host)", async () => {
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => {
      throw new Error("ENOENT: command not found");
    });
    expect(await detectIsElevated(runner)).toBe(false);
  });

  it("returns false when `net session` exits with an unexpected non-zero code (defensive)", async () => {
    // Spec says net session exits 0 (admin) or 2 (non-admin), but a hosed
    // PATH or a localized Windows variant could surface a different code.
    // Treat any non-zero as "not elevated" so the caller's elevation-gated
    // UX never falsely promises admin.
    const runner = new FakeExecRunner((_cmd, _args): ExecResult => ({
      exitCode: 5,
      stdout: "",
      stderr: "",
    }));
    expect(await detectIsElevated(runner)).toBe(false);
  });
});
