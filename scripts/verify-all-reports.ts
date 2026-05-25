#!/usr/bin/env tsx
/**
 * End-to-end live verification of every report connector against TallyPrime.
 * Prints wall-clock + row counts. Exits non-zero if any report fails.
 *
 * Usage:
 *   pnpm verify-all-reports
 *   pnpm verify-all-reports --company "OM JAI JAGDISH" --from 20220401 --to 20230331
 */
import { TallyHttpClient } from "@tallymcp/tally-connector";
import {
  getBalanceSheet,
  getCompanyInfo,
  getDayBook,
  getGroupClosingBalances,
  getLedgerClosingBalance,
  getProfitAndLoss,
  getSalesRegister,
  getTrialBalance,
  listCompanies,
  listGroups,
  listLedgers,
  listVoucherTypes,
} from "@tallymcp/report-engine";

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

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; result: T; error?: string }> {
  const started = Date.now();
  try {
    const result = await fn();
    return { label, ms: Date.now() - started, result };
  } catch (err) {
    return { label, ms: Date.now() - started, result: null as unknown as T, error: (err as Error).message };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const company = args.company ?? "OM JAI JAGDISH";
  const fromDate = args.from ?? "20220401";
  const toDate = args.to ?? "20230331";
  const host = args.host ?? process.env.TALLY_HOST ?? "127.0.0.1";
  const port = Number(args.port ?? process.env.TALLY_PORT ?? 9000);

  console.log(`[verify-all-reports] Tally ${host}:${port}, company "${company}", period ${fromDate}–${toDate}\n`);

  const tdlClient = new TallyHttpClient({ host, port, timeoutMs: 60_000, headersTimeoutMs: 15_000, serialize: true, charset: "utf-16" });
  const legacyClient = new TallyHttpClient({ host, port, timeoutMs: 30_000, headersTimeoutMs: 10_000, serialize: true, charset: "utf-8" });

  type Outcome = { label: string; ms: number; rows: number; ok: boolean; error?: string };
  const results: Outcome[] = [];

  function record(label: string, ms: number, rows: number, ok: boolean, error?: string): void {
    results.push({ label, ms, rows, ok, error });
    const status = ok ? "✅" : "❌";
    const ms_s = ms.toString().padStart(5);
    const rows_s = rows.toString().padStart(6);
    console.log(`  ${status} ${label.padEnd(30)} ${ms_s} ms  ${rows_s} rows  ${error ? "— " + error : ""}`);
  }

  // ── Legacy (UTF-8 / Collection form) ─────────────────────────────
  console.log("LEGACY connectors (UTF-8 + Collection+TDL form):");
  {
    const r = await timed("list-companies", () => listCompanies(legacyClient));
    record("list-companies", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("company-info", () => getCompanyInfo(legacyClient, { company }));
    record("company-info", r.ms, r.error ? 0 : 1, !r.error, r.error);
  }
  {
    const r = await timed("list-ledgers", () => listLedgers(legacyClient, { company }));
    record("list-ledgers", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("list-groups", () => listGroups(legacyClient, { company }));
    record("list-groups", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("list-voucher-types", () => listVoucherTypes(legacyClient, { company }));
    record("list-voucher-types", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("ledger-closing-balance", () =>
      getLedgerClosingBalance(legacyClient, { company, ledger: "Cash", fromDate, toDate }),
    );
    record("ledger-closing-balance (Cash)", r.ms, r.error ? 0 : 1, !r.error, r.error);
  }
  {
    const r = await timed("group-closing-balances", () =>
      getGroupClosingBalances(legacyClient, { company, groupName: "Sales Accounts", fromDate, toDate }),
    );
    record("group-closing-balances (Sales)", r.ms, r.error ? 0 : r.result.ledgerCount, !r.error, r.error);
  }

  // ── TDL-backed (UTF-16 / inline REPORT+COLLECTION) ──────────────
  console.log("\nTDL-backed connectors (UTF-16 + inline REPORT+COLLECTION):");
  {
    const r = await timed("trial-balance", () => getTrialBalance(tdlClient, { company, fromDate, toDate }));
    record("trial-balance", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("profit-and-loss", () => getProfitAndLoss(tdlClient, { company, fromDate, toDate }));
    record("profit-and-loss", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("balance-sheet", () => getBalanceSheet(tdlClient, { company, fromDate, toDate }));
    record("balance-sheet", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("day-book", () => getDayBook(tdlClient, { company, fromDate, toDate }));
    record("day-book", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }
  {
    const r = await timed("sales-register", () => getSalesRegister(tdlClient, { company, fromDate, toDate }));
    record("sales-register", r.ms, r.error ? 0 : r.result.length, !r.error, r.error);
  }

  // ── Summary ─────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n[verify-all-reports] ${passed}/${total} reports passed`);
  if (passed < total) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ❌ ${r.label}: ${r.error}`);
    }
    process.exit(1);
  }
  console.log("\n[verify-all-reports] ✅ ALL REPORTS PASS");
}

main().catch((err) => {
  console.error(`\n[verify-all-reports] fatal: ${(err as Error).message}`);
  process.exit(1);
});
