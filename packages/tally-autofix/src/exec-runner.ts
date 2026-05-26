import { spawn } from "node:child_process";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Abstraction over `child_process.spawn` so the Windows-specific code paths
 * (netsh, tasklist) are mockable in unit tests. Tests inject a fake runner.
 */
export interface ExecRunner {
  run(command: string, args: string[]): Promise<ExecResult>;
}

export class RealExecRunner implements ExecRunner {
  run(command: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      proc.on("error", reject);
      proc.on("close", (code) =>
        resolve({ exitCode: code ?? -1, stdout, stderr }),
      );
    });
  }
}

/** Test helper — records calls and replays scripted responses. */
export class FakeExecRunner implements ExecRunner {
  public readonly calls: Array<{ command: string; args: string[] }> = [];
  constructor(
    private readonly responder: (command: string, args: string[]) => ExecResult,
  ) {}
  async run(command: string, args: string[]): Promise<ExecResult> {
    this.calls.push({ command, args });
    return this.responder(command, args);
  }
}
