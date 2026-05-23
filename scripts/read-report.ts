#!/usr/bin/env tsx
/**
 * Live-Tally smoke test for the read-only report engine.
 *
 * Usage:
 *   pnpm read-report --report TrialBalance --company "10000 - Acme Trading"
 *   pnpm read-report --report ListOfCompanies
 *   pnpm read-report --report DayBook --company "Acme" --from 20260401 --to 20260430
 *
 * Environment:
 *   TALLY_HOST   default 127.0.0.1
 *   TALLY_PORT   default 9000
 */
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { runReport } from "@tallymcp/report-engine";
import { ReportIdSchema } from "@tallymcp/shared-types";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function printUsage(): void {
  console.log(`TallyMCP read-report — run a single Tally report against a live TallyPrime instance.

Usage:
  pnpm read-report --report <ReportId> [options]

Required:
  --report <id>      One of: ${ReportIdSchema.options.join(", ")}

Optional:
  --company <name>   Exact Tally company name (required for all reports except ListOfCompanies)
  --from <YYYYMMDD>  Period start (period reports default to current Indian FY)
  --to <YYYYMMDD>    Period end
  --host <host>      Tally host (default 127.0.0.1 or env TALLY_HOST)
  --port <port>      Tally XML port (default 9000 or env TALLY_PORT)
  --help             Print this help

Notes:
  - TallyPrime must be running with a company loaded and XML/HTTP enabled (Client/Server → Both).
  - Period reports (DayBook, TrialBalance, ProfitAndLoss, BalanceSheet, SalesRegister) require a company.
  - When --from/--to are omitted, the current Indian FY (Apr 1 – Mar 31) is used.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.report) {
    printUsage();
    if (!args.help) process.exit(1);
    return;
  }

  const reportId = ReportIdSchema.parse(args.report);
  const host = args.host ?? process.env.TALLY_HOST ?? "127.0.0.1";
  const port = Number(args.port ?? process.env.TALLY_PORT ?? 9000);
  if (Number.isNaN(port)) throw new Error(`Invalid port: ${args.port}`);

  const client = new TallyHttpClient({
    host,
    port,
    timeoutMs: 120_000,
    headersTimeoutMs: 60_000,
  });
  const startedAt = Date.now();

  const result = await runReport(client, {
    reportId,
    company: args.company,
    fromDate: args.from,
    toDate: args.to,
  });

  const elapsed = Date.now() - startedAt;
  console.log(JSON.stringify(result, null, 2));
  console.error(
    `\n[read-report] ${reportId}: ${result.rows.length} row(s) in ${elapsed} ms (Tally at ${host}:${port})`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[read-report] failed: ${message}`);
  process.exit(1);
});
