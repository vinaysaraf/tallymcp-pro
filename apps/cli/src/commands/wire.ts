import { join } from "node:path";
import { ClientWirer, type ClientId, type McpServerEntry, type WireResult, CLIENT_REGISTRY, resolveClientConfigPath } from "@tallymcp/client-wirer";
import { AbortError, assertInteractiveOrYes, formatPreview, readStdinConfirm, type ConfirmFn } from "../confirm.js";

export interface RunWireOptions {
  clientId: ClientId;
  /** The TallyMCP install directory (where node.exe + mcp-server live). */
  installDir: string;
  /** Environment for resolving the AI client's config path. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** When true, skip the interactive confirmation prompt. */
  yes?: boolean;
  /** Override the default stdin reader (used by tests). */
  confirmFn?: ConfirmFn;
}

export async function runWireCommand(opts: RunWireOptions): Promise<WireResult> {
  const env = opts.env ?? process.env;
  const configPath = resolveClientConfigPath(opts.clientId, env);

  const entry: McpServerEntry = {
    command: join(opts.installDir, "node.exe"),
    args: [join(opts.installDir, "mcp-server", "main.js")],
    env: { TALLYMCP_CONFIG: join(opts.installDir, "config.json") },
  };

  const serversKey = CLIENT_REGISTRY[opts.clientId].serversKey;
  const entryLines = [
    `"tallymcp-pro": {`,
    `  "command": "${entry.command}",`,
    `  "args":    ["${entry.args[0]}"],`,
    `  "env":     { "TALLYMCP_CONFIG": "${entry.env!["TALLYMCP_CONFIG"]}" }`,
    `}`,
  ].join("\n");

  const previewItem =
    `Edit  ${configPath}\n` +
    `Add this entry to "${serversKey}":\n` +
    entryLines + `\n` +
    `Backup will be saved to ${configPath}.bak first.`;

  const preview = formatPreview("I will make 1 change to your PC:", [previewItem]);
  process.stdout.write(preview);
  process.stdout.write(
    `This change is reversible with \`tallymcp-cli unwire ${opts.clientId}\`.\n\n`,
  );

  assertInteractiveOrYes({ yes: opts.yes });

  if (!(opts.yes ?? false)) {
    const confirmFn = opts.confirmFn ?? readStdinConfirm;
    const confirmed = await confirmFn("Proceed? [y/N] ");
    if (!confirmed) throw new AbortError();
  }

  const wirer = new ClientWirer({ env, entry });
  return wirer.add(opts.clientId);
}
