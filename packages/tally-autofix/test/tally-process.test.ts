import { describe, it, expect } from "vitest";
import {
  detectTallyRunning,
  waitForTallyClose,
  waitForTallyHttp,
} from "../src/tally-process.js";
import { FakeExecRunner } from "../src/exec-runner.js";

describe("detectTallyRunning", () => {
  it("returns true when tasklist shows tally.exe", async () => {
    const runner = new FakeExecRunner(() => ({
      exitCode: 0,
      stdout: 'Image Name\ntally.exe                12345 Console',
      stderr: "",
    }));
    expect(await detectTallyRunning(runner)).toBe(true);
  });

  it("returns false when tasklist has no tally.exe entry", async () => {
    const runner = new FakeExecRunner(() => ({
      exitCode: 0,
      stdout: 'INFO: No tasks are running which match the specified criteria.',
      stderr: "",
    }));
    expect(await detectTallyRunning(runner)).toBe(false);
  });
});

describe("waitForTallyClose", () => {
  it("returns true when Tally exits within the timeout", async () => {
    let calls = 0;
    const runner = new FakeExecRunner(() => {
      calls++;
      return {
        exitCode: 0,
        stdout: calls < 3 ? "tally.exe 1 Console" : "INFO: No tasks are running",
        stderr: "",
      };
    });
    const closed = await waitForTallyClose(runner, { pollMs: 5, timeoutMs: 500 });
    expect(closed).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("returns false when Tally is still running past the timeout", async () => {
    const runner = new FakeExecRunner(() => ({
      exitCode: 0,
      stdout: "tally.exe 1 Console",
      stderr: "",
    }));
    const closed = await waitForTallyClose(runner, { pollMs: 5, timeoutMs: 30 });
    expect(closed).toBe(false);
  });
});

describe("waitForTallyHttp", () => {
  it("returns true when fetch eventually succeeds", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls < 2) throw new Error("ECONNREFUSED");
      return { status: 200 } as Response;
    };
    const ok = await waitForTallyHttp({
      url: "http://127.0.0.1:9000",
      pollMs: 5,
      timeoutMs: 200,
      fetcher,
    });
    expect(ok).toBe(true);
  });

  it("returns false when fetch never succeeds in the timeout window", async () => {
    const fetcher = async () => {
      throw new Error("ECONNREFUSED");
    };
    const ok = await waitForTallyHttp({
      url: "http://127.0.0.1:9000",
      pollMs: 5,
      timeoutMs: 30,
      fetcher,
    });
    expect(ok).toBe(false);
  });
});
