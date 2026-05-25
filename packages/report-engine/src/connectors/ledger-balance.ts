import { z } from "zod";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyDate } from "@tallymcp/shared-types";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Closing balance for a single named ledger over a period.
 *
 * Backed by the inline-TDL `trial-balance` template, which projects
 * Name/Parent/Opening/Debit/Credit/Closing for every ledger in one fast
 * server-side computation. We then filter client-side by exact (case-
 * insensitive) name match.
 *
 * Why not server-side filter? On Silver, `<FILTER>` on `$Name` against the
 * full Ledger collection forces Tally to evaluate the filter expression for
 * every ledger before applying — slower than just receiving all rows. The
 * TDL-projected payload is small (~6 columns × N ledgers) and parses in
 * milliseconds.
 *
 * Earlier implementations used a raw `Collection`+`FETCH` envelope with a
 * `$ClosingBalance` projection. On Silver/busy datasets that path wedges
 * the gateway because Tally evaluates `$ClosingBalance` before any filter
 * is applied. Switching to the TDL template removes the wedge.
 */
export const LedgerClosingBalanceSchema = z.object({
  ledger: z.string().min(1),
  parent: z.string().min(1),
  /** Net amount in INR. Positive = debit-side close, negative = credit-side close. */
  closing: z.number(),
});
export type LedgerClosingBalance = z.infer<typeof LedgerClosingBalanceSchema>;

export interface GetLedgerClosingBalanceOptions {
  company: string;
  /** Exact ledger name as it appears in Tally. */
  ledger: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

interface TdlTbRow {
  ledger: string;
  parent: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

async function fetchTdlTrialBalance(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<TdlTbRow[]> {
  const report = getReport("trial-balance");
  const template = loadTemplate(report);
  return runTdlReport<TdlTbRow>(client, report, template, {
    fromDate: tallyDateToJs(options.fromDate),
    toDate: tallyDateToJs(options.toDate),
    targetCompany: options.company,
  });
}

function tallyDateToJs(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}

export async function getLedgerClosingBalance(
  client: TallyClient,
  options: GetLedgerClosingBalanceOptions,
): Promise<LedgerClosingBalance> {
  const rows = await fetchTdlTrialBalance(client, options);
  const norm = (s: string): string => s.trim().toLowerCase();
  const match = rows.find((r) => norm(r.ledger) === norm(options.ledger));
  if (!match) {
    throw new TallyReportError("LedgerClosingBalance", [
      `Ledger "${options.ledger}" not found in the trial balance (${rows.length} ledgers scanned).`,
    ]);
  }
  // Parent="" at root → schema requires non-empty. Use a sentinel.
  const parent = match.parent.trim() === "" ? "(top-level)" : match.parent;
  return LedgerClosingBalanceSchema.parse({
    ledger: match.ledger,
    parent,
    closing: match.closing,
  });
}

/**
 * Sums closing balances across every ledger whose `Parent` (group) matches
 * `groupName`. Useful for the "sales figure" question: groupName="Sales Accounts".
 *
 * Same TDL trial-balance backing as `getLedgerClosingBalance` — one fast call,
 * client-side group filter.
 */
export interface GetGroupClosingBalanceOptions {
  company: string;
  groupName: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

export interface GroupClosingBalance {
  groupName: string;
  ledgerCount: number;
  totalClosing: number;
  ledgers: LedgerClosingBalance[];
}

export async function getGroupClosingBalances(
  client: TallyClient,
  options: GetGroupClosingBalanceOptions,
): Promise<GroupClosingBalance> {
  const rows = await fetchTdlTrialBalance(client, options);
  const norm = (s: string): string => s.trim().toLowerCase();
  const target = norm(options.groupName);
  const matched = rows.filter((r) => norm(r.parent) === target);

  const ledgers = matched.map((r) =>
    LedgerClosingBalanceSchema.parse({
      ledger: r.ledger,
      parent: r.parent.trim() === "" ? "(top-level)" : r.parent,
      closing: r.closing,
    }),
  );
  const totalClosing = ledgers.reduce((a, l) => a + l.closing, 0);

  return {
    groupName: options.groupName,
    ledgerCount: ledgers.length,
    totalClosing,
    ledgers,
  };
}
