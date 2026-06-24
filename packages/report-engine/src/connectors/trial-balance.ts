import {
  TrialBalanceRowSchema,
  type TallyDate,
  type TrialBalanceRow,
} from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

interface TdlTbRow {
  ledger: string;
  parent: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

/**
 * Reads the `Trial Balance` report for the period via the inline-TDL engine.
 *
 * Each TDL output row represents a leaf Ledger object. `parent` is the
 * containing group ("" when the ledger is at the chart-of-accounts root).
 *
 * A Trial Balance lists each ledger's CLOSING balance (Dr or Cr) and the two
 * columns tie out. We derive closing = opening + debit − credit (all signed
 * TDL columns, where a Dr balance is negative and a Cr balance positive). This
 * equals Tally's `$ClosingBalance` for balance-sheet ledgers AND gives the
 * correct net for nominal/P&L ledgers — for which `$ClosingBalance` reports 0
 * over the XML interface, which would otherwise leave the TB un-tied (off by
 * the period's profit). Because every voucher balances, Σ debit = Σ credit, so
 * the derived TB ties out. (Earlier versions surfaced raw debit/credit
 * *turnover* here, which is movement, not balances, and isn't a true TB.)
 */
export async function getTrialBalance(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<TrialBalanceRow[]> {
  const report = getReport("trial-balance");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlTbRow>(client, report, template, {
    fromDate: toDate(options.fromDate),
    toDate: toDate(options.toDate),
    targetCompany: options.company,
  });
  return rows.map(toTbRow);
}

function toTbRow(row: TdlTbRow): TrialBalanceRow {
  const groupName = row.parent.trim() === "" ? "(top-level)" : row.parent;
  // Signed closing: opening + debit-turnover − credit-turnover. Dr balances are
  // negative, Cr balances positive (the TDL fields encode $$IsDebit this way).
  const signedClosing = row.opening + row.debit - row.credit;
  return TrialBalanceRowSchema.parse({
    groupName,
    ledgerName: row.ledger,
    debit: signedClosing < 0 ? -signedClosing : 0,
    credit: signedClosing > 0 ? signedClosing : 0,
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
