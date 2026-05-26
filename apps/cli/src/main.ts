#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runWireCommand } from "./commands/wire.js";
import { runUnwireCommand } from "./commands/unwire.js";
import { runTallyFixCommand } from "./commands/tally-fix.js";
import { runTallyRestoreCommand } from "./commands/tally-restore.js";
import { CLIENT_REGISTRY, type ClientId } from "@tallymcp/client-wirer";
import { AbortError } from "./confirm.js";

const VALID_CLIENTS = Object.keys(CLIENT_REGISTRY) as ClientId[];

export function assertValidClient(arg: string): ClientId {
  if ((VALID_CLIENTS as string[]).includes(arg)) return arg as ClientId;
  throw new Error(
    `Unknown AI client "${arg}". Valid options: ${VALID_CLIENTS.join(", ")}`,
  );
}

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
    .option("-y, --yes", "skip the interactive confirmation prompt")
    .action(async (clientArg: string, opts: { installDir: string; yes?: boolean }) => {
      try {
        const result = await runWireCommand({
          clientId: assertValidClient(clientArg),
          installDir: opts.installDir,
          yes: opts.yes ?? false,
        });
        console.log(`✓ ${result.action} ${result.clientId} → ${result.configPath}`);
        if (result.backupCreated) console.log(`  (backup created at ${result.configPath}.bak)`);
      } catch (err) {
        if (err instanceof AbortError) {
          console.log("Aborted.");
          process.exit(1);
        }
        throw err;
      }
    });

  program
    .command("unwire <client>")
    .description("Remove TallyMCP from the given AI client's config")
    .option("-y, --yes", "skip the interactive confirmation prompt")
    .action(async (clientArg: string, opts: { yes?: boolean }) => {
      try {
        const result = await runUnwireCommand({
          clientId: assertValidClient(clientArg),
          yes: opts.yes ?? false,
        });
        console.log(`✓ ${result.action} ${result.clientId} → ${result.configPath}`);
      } catch (err) {
        if (err instanceof AbortError) {
          console.log("Aborted.");
          process.exit(1);
        }
        throw err;
      }
    });

  program
    .command("tally-fix")
    .description("Turn on Tally's XML interface and add the Windows Firewall rule")
    .option(
      "--tally-dir <path>",
      "Explicit Tally install directory (required when multiple installs are detected)",
    )
    .option("-y, --yes", "skip the interactive confirmation prompt")
    .action(async (opts: { tallyDir?: string; yes?: boolean }) => {
      try {
        const result = await runTallyFixCommand({
          tallyDir: opts.tallyDir,
          yes: opts.yes ?? false,
        });
        console.log(`✓ tally.ini at ${result.install.iniPath}: ${result.xmlInterface}`);
        if (result.firewallRule === "skipped-non-admin") {
          console.log(`⚠ Firewall rule: skipped — requires Administrator`);
          console.log(`  Loopback (127.0.0.1:9000) works without it. If you need other PCs`);
          console.log(`  on your network to reach this Tally over port 9000, re-run from an`);
          console.log(`  elevated terminal:`);
          console.log(`    powershell -Command "Start-Process pwsh -Verb RunAs"`);
        } else {
          console.log(`✓ Firewall rule: ${result.firewallRule}`);
        }
        console.log(`\nNow open TallyPrime and load a company.`);
      } catch (err) {
        if (err instanceof AbortError) {
          console.log("Aborted.");
          process.exit(1);
        }
        throw err;
      }
    });

  program
    .command("tally-restore")
    .description("Restore tally.ini from backup and remove the firewall rule")
    .option(
      "--tally-dir <path>",
      "Explicit Tally install directory (required when multiple installs are detected)",
    )
    .option("-y, --yes", "skip the interactive confirmation prompt")
    .action(async (opts: { tallyDir?: string; yes?: boolean }) => {
      try {
        await runTallyRestoreCommand({
          tallyDir: opts.tallyDir,
          yes: opts.yes ?? false,
        });
        console.log("✓ tally.ini restored from backup");
        console.log("✓ Firewall rule removed");
      } catch (err) {
        if (err instanceof AbortError) {
          console.log("Aborted.");
          process.exit(1);
        }
        throw err;
      }
    });

  return program;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  await createProgram().parseAsync(process.argv);
}
