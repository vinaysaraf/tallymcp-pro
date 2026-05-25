import { ClientWirer, type ClientId, type UnwireResult } from "@tallymcp/client-wirer";

export interface RunUnwireOptions {
  clientId: ClientId;
  env?: Record<string, string | undefined>;
}

export async function runUnwireCommand(opts: RunUnwireOptions): Promise<UnwireResult> {
  // ClientWirer.remove() doesn't need a fully-populated entry — pass a stub.
  const wirer = new ClientWirer({
    env: opts.env ?? process.env,
    entry: { command: "(unused-for-remove)", args: [] },
  });
  return wirer.remove(opts.clientId);
}
