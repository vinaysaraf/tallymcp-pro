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
 * We map to the existing `TrialBalanceRow` contract for backward compatibility
 * with consumers in v0.6 — opening and closing balances are dropped at this
 * layer in v0.7.0 and surface via the dedicated `getLedgerClosingBalance` /
 * `getGroupClosingBalances` connectors in v0.7.1.
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
  return TrialBalanceRowSchema.parse({
    groupName,
    ledgerName: row.ledger,
    debit: row.debit,
    credit: row.credit,
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
