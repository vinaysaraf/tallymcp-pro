#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runWireCommand } from "./commands/wire.js";
import { runUnwireCommand } from "./commands/unwire.js";
import { runTallyFixCommand } from "./commands/tally-fix.js";
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

  program
    .command("unwire <client>")
    .description("Remove TallyMCP from the given AI client's config")
    .action(async (clientArg: string) => {
      const result = await runUnwireCommand({ clientId: clientArg as ClientId });
      console.log(`✓ ${result.action} ${result.clientId} → ${result.configPath}`);
    });

  program
    .command("tally-fix")
    .description("Turn on Tally's XML interface and add the Windows Firewall rule")
    .option(
      "--tally-dir <path>",
      "Explicit Tally install directory (required when multiple installs are detected)",
    )
    .action(async (opts: { tallyDir?: string }) => {
      const result = await runTallyFixCommand({ tallyDir: opts.tallyDir });
      console.log(`✓ tally.ini at ${result.install.iniPath}: ${result.xmlInterface}`);
      console.log(`✓ Firewall rule: ${result.firewallRule}`);
      console.log(`\nNow open TallyPrime and load a company.`);
    });

  return program;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  await createProgram().parseAsync(process.argv);
}
