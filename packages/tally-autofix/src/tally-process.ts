import type { ExecRunner } from "./exec-runner.js";

export async function detectTallyRunning(runner: ExecRunner): Promise<boolean> {
  const result = await runner.run("tasklist", ["/FI", "IMAGENAME eq tally.exe"]);
  return /tally\.exe/i.test(result.stdout);
}

export interface WaitOptions {
  pollMs: number;
  timeoutMs: number;
}

export async function waitForTallyClose(
  runner: ExecRunner,
  opts: WaitOptions,
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (!(await detectTallyRunning(runner))) return true;
    await sleep(opts.pollMs);
  }
  return false;
}

export interface WaitForHttpOptions extends WaitOptions {
  url: string;
  /** Override globalThis.fetch in tests. */
  fetcher?: (url: string) => Promise<Response>;
}

export async function waitForTallyHttp(opts: WaitForHttpOptions): Promise<boolean> {
  const fetcher = opts.fetcher ?? ((url) => fetch(url));
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetcher(opts.url);
      if (resp.status === 200) return true;
    } catch {
      // not ready yet
    }
    await sleep(opts.pollMs);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
