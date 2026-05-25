import { createInterface } from "node:readline/promises";

export class AbortError extends Error {
  constructor(message = "Aborted by user.") {
    super(message);
    this.name = "AbortError";
  }
}

export type ConfirmFn = (message: string) => Promise<boolean>;

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
