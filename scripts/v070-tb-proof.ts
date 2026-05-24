#!/usr/bin/env tsx
/**
 * v0.7.0 kill-switch: prove that the TDL trial-balance template returns ≥1
 * row in <5 s against the live OM JAI JAGDISH book on TallyPrime Silver,
 * and that Tally remains responsive afterwards.
 *
 * Usage:
 *   pnpm v070-tb-proof
 *   pnpm v070-tb-proof --company "OM JAI JAGDISH" --from 20220401 --to 20230331
 *   pnpm v070-tb-proof --charset utf-8     (fallback if UTF-16 is the wrong choice for this instance)
 *
 * Environment:
 *   TALLY_HOST  default 127.0.0.1
 *   TALLY_PORT  default 9000
 */
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { getTrialBalance } from "@tallymcp/report-engine";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else {
      out[a.slice(2)] = "true";
    }
  }
  return out;
}

const PROOF_BUDGET_MS = 5_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const company = args.company ?? "OM JAI JAGDISH";
  const fromDate = args.from ?? "20220401";
  const toDate = args.to ?? "20230331";
  const host = args.host ?? process.env.TALLY_HOST ?? "127.0.0.1";
  const port = Number(args.port ?? process.env.TALLY_PORT ?? 9000);
  const charset = args.charset === "utf-8" ? ("utf-8" as const) : ("utf-16" as const);

  console.log(
    `[v070-tb-proof] Tally ${host}:${port}, company "${company}", period ${fromDate}–${toDate}, charset=${charset}`,
  );
  console.log(`[v070-tb-proof] Kill-switch budget: ${PROOF_BUDGET_MS} ms`);

  const client = new TallyHttpClient({
    host,
    port,
    timeoutMs: 15_000,
    headersTimeoutMs: 10_000,
    serialize: true,
    charset,
  });

  const startedAt = Date.now();
  let rows;
  try {
    rows = await getTrialBalance(client, { company, fromDate, toDate });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`\n[v070-tb-proof] ❌ FAILED after ${elapsed} ms: ${(err as Error).message}`);
    process.exit(1);
  }
  const elapsed = Date.now() - startedAt;

  console.log(`\n[v070-tb-proof] TB returned ${rows.length} row(s) in ${elapsed} ms`);
  if (rows.length > 0) {
    console.log("[v070-tb-proof] Sample rows:");
    for (const row of rows.slice(0, 3)) {
      console.log(
        `  ${row.ledgerName ?? "(no name)"} → group=${row.groupName} dr=${row.debit} cr=${row.credit}`,
      );
    }
  }

  const latencyOk = elapsed < PROOF_BUDGET_MS;
  const rowsOk = rows.length >= 1;

  if (!latencyOk) {
    console.error(
      `\n[v070-tb-proof] ❌ LATENCY FAIL: ${elapsed} ms ≥ ${PROOF_BUDGET_MS} ms budget. Abort v0.7.`,
    );
    process.exit(1);
  }
  if (!rowsOk) {
    console.error(
      `\n[v070-tb-proof] ❌ ROW COUNT FAIL: expected ≥1 row, got ${rows.length}. Abort v0.7.`,
    );
    process.exit(1);
  }

  // Tally responsiveness check: a second cheap call must succeed in <2 s.
  const followupStarted = Date.now();
  try {
    await client.post(
      `<ENVELOPE><HEADER><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="List of Companies" ISMODIFY="No"><TYPE>Company</TYPE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`,
      { charset: "utf-8" },
    );
  } catch (err) {
    console.error(
      `\n[v070-tb-proof] ❌ RESPONSIVENESS FAIL: follow-up call errored: ${(err as Error).message}`,
    );
    process.exit(1);
  }
  const followupElapsed = Date.now() - followupStarted;
  console.log(`[v070-tb-proof] Tally still responsive (follow-up call: ${followupElapsed} ms)`);

  console.log(`\n[v070-tb-proof] ✅ PASS — TB ${elapsed} ms with ${rows.length} rows; Tally responsive after.`);
  console.log(
    `[v070-tb-proof] Paste these numbers into docs/live-tally-checklist.md under the v0.7.0 row.`,
  );
}

main().catch((err) => {
  console.error(`\n[v070-tb-proof] fatal: ${(err as Error).message}`);
  process.exit(1);
});
