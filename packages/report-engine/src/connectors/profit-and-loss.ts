import { PnlRowSchema, type PnlRow, type TallyDate } from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

interface TdlPlRow {
  group: string;
  parent: string;
  closing: number;
}

/**
 * Reads the Profit & Loss A/c (revenue groups + their closing balances) for
 * the period via the inline-TDL engine.
 *
 * Each row is a revenue group (those with `$IsRevenue = Yes`). Negative
 * `closing` means net credit-side balance (income); positive means net
 * debit-side balance (expense).
 */
export async function getProfitAndLoss(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<PnlRow[]> {
  const report = getReport("profit-loss");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlPlRow>(client, report, template, {
    fromDate: toDate(options.fromDate),
    toDate: toDate(options.toDate),
    targetCompany: options.company,
  });
  return rows.map(toPlRow);
}

function toPlRow(row: TdlPlRow): PnlRow {
  return PnlRowSchema.parse({
    head: row.group,
    subHead: row.parent.trim() === "" ? undefined : row.parent,
    amount: row.closing,
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
