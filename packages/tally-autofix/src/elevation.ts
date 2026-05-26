import type { ExecRunner } from "./exec-runner.js";

/**
 * Returns true when the current process is running with Administrator
 * privileges on Windows. Uses `net session` which is the canonical
 * Microsoft-recommended check:
 *
 *   - Admin process → `net session` exits 0 (lists server sessions, even
 *     when there are none).
 *   - Non-admin process → exits 2 with "System error 5: Access is denied."
 *
 * The check is read-only and side-effect-free. Returns false on any
 * unexpected failure (missing net.exe, runner exception) so the caller's
 * elevation-gated UX never falsely promises admin.
 *
 * Spec: docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md §7
 * (Tally auto-fix — auto-fix B requires admin for firewall edits).
 */
export async function detectIsElevated(runner: ExecRunner): Promise<boolean> {
  try {
    const result = await runner.run("net", ["session"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
