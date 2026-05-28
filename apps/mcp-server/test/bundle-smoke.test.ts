// apps/mcp-server/test/bundle-smoke.test.ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(__dirname, "..", "dist", "main.bundle.js");

describe("MCP server bundle smoke (#152)", () => {
  it("the bundle starts without ERR_MODULE_NOT_FOUND", async () => {
    // Sanity-check the bundle exists. The `test` script chains
    // `pnpm run build` first, so dist/main.bundle.js should be present.
    await access(bundlePath);

    return new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [bundlePath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });

      let stderr = "";
      let stdout = "";
      let settled = false;

      const finish = (result: { ok: true } | { ok: false; reason: string }): void => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch { /* already exited */ }
        if (result.ok) resolve();
        else reject(new Error(result.reason));
      };

      child.stderr.on("data", (c: Buffer) => { stderr += c.toString("utf8"); });
      child.stdout.on("data", (c: Buffer) => { stdout += c.toString("utf8"); });

      // 4s window: the bundle should idle on stdio waiting for MCP JSON-RPC
      // messages, NOT exit. Bumped from 2s per Cursor rec for slow CI runners.
      const timer = setTimeout(() => {
        if (stderr.includes("ERR_MODULE_NOT_FOUND")) {
          finish({ ok: false, reason: `bundle threw ERR_MODULE_NOT_FOUND:\n${stderr}` });
        } else if (stderr.includes("Cannot find package")) {
          finish({ ok: false, reason: `bundle has missing package:\n${stderr}` });
        } else {
          finish({ ok: true });
        }
      }, 4000);

      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        // Our own kill() in finish() triggers SIGTERM — ignore that.
        if (signal === "SIGTERM" || signal === "SIGKILL") return;
        if (stderr.includes("ERR_MODULE_NOT_FOUND") || stderr.includes("Cannot find package")) {
          finish({ ok: false, reason: `bundle crashed with missing module:\n${stderr}` });
        } else {
          // Unexpected clean exit before idle is also a failure (Cursor rec):
          // the server should be waiting on stdio, not exiting on its own.
          finish({
            ok: false,
            reason: `bundle exited unexpectedly (code=${code}) before idle.\nstderr: ${stderr}\nstdout: ${stdout}`,
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        finish({ ok: false, reason: `spawn error: ${(err as Error).message}` });
      });
    });
  }, 15000); // 15s vitest timeout (4s smoke + spawn + cleanup margin)
});
