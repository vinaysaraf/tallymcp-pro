#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runWireCommand } from "./commands/wire.js";
import type { ClientId } from "@tallymcp/client-wirer";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("tallymcp-cli")
    .description("TallyMCP installer — terminal commands")
    .version("0.0.1");

  program
    .command("wire <client>")
    .description("Add TallyMCP to the given AI client's config")
    .requiredOption("--install-dir <path>", "TallyMCP install directory")
    .action(async (clientArg: string, opts: { installDir: string }) => {
      const result = await runWireCommand({
        clientId: clientArg as ClientId,
        installDir: opts.installDir,
      });
      console.log(`✓ ${result.action} ${result.clientId} → ${result.configPath}`);
      if (result.backupCreated) console.log(`  (backup created at ${result.configPath}.bak)`);
    });

  return program;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  await createProgram().parseAsync(process.argv);
}
