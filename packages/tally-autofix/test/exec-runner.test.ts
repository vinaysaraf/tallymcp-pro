import { describe, it, expect } from "vitest";
import { RealExecRunner, type ExecRunner, type ExecResult } from "../src/exec-runner.js";

describe("RealExecRunner", () => {
  it("runs a command and captures stdout, stderr, exit code", async () => {
    const runner: ExecRunner = new RealExecRunner();
    const result: ExecResult = await runner.run("node", ["-e", "console.log('hi'); process.exit(0)"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi");
  });

  it("captures non-zero exit codes without throwing", async () => {
    const runner = new RealExecRunner();
    const result = await runner.run("node", ["-e", "process.exit(7)"]);
    expect(result.exitCode).toBe(7);
  });
});
