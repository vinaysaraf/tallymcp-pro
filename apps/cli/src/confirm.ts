import { createInterface } from "node:readline/promises";

export class AbortError extends Error {
  constructor(message = "Aborted by user.") {
    super(message);
    this.name = "AbortError";
  }
}

export type ConfirmFn = (message: string) => Promise<boolean>;

/**
 * Throws a clear error when the CLI is invoked non-interactively
 * (e.g. in a script, CI, or IDE task) without `--yes`. Without this guard,
 * `readStdinConfirm` would block on a stdin that never receives input.
 *
 * Call this BEFORE printing the preview if you want zero output in CI,
 * or AFTER printing if operators should see the plan in logs. We call it
 * AFTER the preview so the audit trail is visible.
 */
export function assertInteractiveOrYes(opts: { yes?: boolean }): void {
  if (opts.yes) return;
  if (process.stdin.isTTY) return;
  throw new Error(
    "stdin is not a terminal. Re-run with --yes (-y) to apply changes without a prompt.",
  );
}

/**
 * Default confirm reader: prompts on stdout, reads one line from stdin,
 * returns true only on explicit "y"/"yes" (case-insensitive). Anything else
 * — including empty input — is "no".
 */
export const readStdinConfirm: ConfirmFn = async (message) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(message);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
};

/** Format a preview block with a left margin and a leading "I will ..." */
export function formatPreview(title: string, items: string[]): string {
  const indent = (s: string) =>
    s
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
  return `\n${title}\n\n${items.map((it, i) => indent(`${i + 1}. ${it}`)).join("\n\n")}\n`;
}
