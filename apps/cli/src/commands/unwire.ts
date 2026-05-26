import { ClientWirer, type ClientId, type UnwireResult, CLIENT_REGISTRY, resolveClientConfigPath } from "@tallymcp/client-wirer";
import { AbortError, assertInteractiveOrYes, formatPreview, readStdinConfirm, type ConfirmFn } from "../confirm.js";

export interface RunUnwireOptions {
  clientId: ClientId;
  env?: Record<string, string | undefined>;
  /** When true, skip the interactive confirmation prompt. */
  yes?: boolean;
  /** Override the default stdin reader (used by tests). */
  confirmFn?: ConfirmFn;
}

export async function runUnwireCommand(opts: RunUnwireOptions): Promise<UnwireResult> {
  const env = opts.env ?? process.env;
  const configPath = resolveClientConfigPath(opts.clientId, env);
  const serversKey = CLIENT_REGISTRY[opts.clientId].serversKey;

  const previewItem =
    `Edit  ${configPath}\n` +
    `Remove the "tallymcp-pro" entry from "${serversKey}".\n` +
    `Other entries in the file are preserved exactly.\n` +
    `A new .bak will be created (if none exists) before the edit.`;

  const preview = formatPreview("I will make 1 change to your PC:", [previewItem]);
  process.stdout.write(preview);

  assertInteractiveOrYes({ yes: opts.yes });

  if (!(opts.yes ?? false)) {
    const confirmFn = opts.confirmFn ?? readStdinConfirm;
    const confirmed = await confirmFn("Proceed? [y/N] ");
    if (!confirmed) throw new AbortError();
  }

  // ClientWirer.remove() doesn't need a fully-populated entry — pass a stub.
  const wirer = new ClientWirer({
    env,
    entry: { command: "(unused-for-remove)", args: [] },
  });
  return wirer.remove(opts.clientId);
}
