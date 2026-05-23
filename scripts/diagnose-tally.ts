#!/usr/bin/env tsx
/**
 * Runs diagnoseTally against Tally XML HTTP (List of Companies probe).
 *
 * Usage:
 *   pnpm diagnose-tally
 *   TALLY_HOST=192.168.1.50 pnpm diagnose-tally
 */
import { diagnoseTally, TallyHttpClient } from "@tallymcp/tally-connector";

function printUsage() {
  console.log(`TallyMCP diagnose-tally — test Tally connectivity with CA-friendly diagnostics

Usage:
  pnpm diagnose-tally              Run against live Tally
  pnpm diagnose-tally --json       Print raw JSON result only

Environment:
  TALLY_HOST   Tally host (default: 127.0.0.1)
  TALLY_PORT   Tally XML port (default: 9000)
`);
}

function formatHuman(result: Awaited<ReturnType<typeof diagnoseTally>>): string {
  if (result.ok) {
    const version = result.tallyVersion ? ` (Tally ${result.tallyVersion})` : "";
    return `OK — Tally XML is reachable${version}. ${result.companiesLoaded} company/companies loaded.`;
  }
  return `${result.code}: ${result.message}\n\nHint: ${result.hint}`;
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    return;
  }

  const jsonOnly = arg === "--json";
  const host = process.env.TALLY_HOST ?? "127.0.0.1";
  const port = Number(process.env.TALLY_PORT ?? "9000");

  const client = new TallyHttpClient({ host, port, serialize: true });
  const result = await diagnoseTally(client);

  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHuman(result));
    if (!result.ok) {
      console.log("\nDetails:", JSON.stringify(result, null, 2));
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
