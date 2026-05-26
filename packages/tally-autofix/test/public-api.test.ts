import { describe, it, expect } from "vitest";
import {
  TallyAutofixer,
  detectTallyInstall,
  detectTallyRunning,
  waitForTallyClose,
  waitForTallyHttp,
  RealExecRunner,
  FakeExecRunner,
  FIREWALL_RULE_NAME,
  parseTallyIni,
  type TallyInstall,
  type ExecRunner,
  type ExecResult,
} from "../src/index.js";

describe("public API", () => {
  it("exports the autofixer", () => expect(typeof TallyAutofixer).toBe("function"));
  it("exports detection functions", () => {
    expect(typeof detectTallyInstall).toBe("function");
    expect(typeof detectTallyRunning).toBe("function");
  });
  it("exports wait helpers", () => {
    expect(typeof waitForTallyClose).toBe("function");
    expect(typeof waitForTallyHttp).toBe("function");
  });
  it("exports the exec runner interface and impls", () => {
    expect(typeof RealExecRunner).toBe("function");
    expect(typeof FakeExecRunner).toBe("function");
  });
  it("exports the firewall rule name constant", () => {
    expect(FIREWALL_RULE_NAME).toMatch(/TallyMCP/);
  });
  it("exports tally.ini parser", () => {
    expect(typeof parseTallyIni).toBe("function");
  });
  it("compiles the public type imports", () => {
    const _i: TallyInstall = { installDir: "x", exePath: "x", iniPath: "x" };
    const _r: ExecResult = { exitCode: 0, stdout: "", stderr: "" };
    const _runner: ExecRunner = new FakeExecRunner(() => _r);
    expect(_i && _r && _runner).toBeTruthy();
  });
});
