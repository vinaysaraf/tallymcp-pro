import {
  BalanceSheetRowSchema,
  type BalanceSheetRow,
  type TallyDate,
} from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

interface TdlBsRow {
  group: string;
  parent: string;
  closing: number;
}

const ASSET_PARENTS = new Set([
  "current assets",
  "fixed assets",
  "investments",
  "loans & advances (asset)",
  "misc. expenses (asset)",
  "stock-in-hand",
  "bank accounts",
  "bank ocd a/c",
  "bank od a/c",
  "cash-in-hand",
  "deposits (asset)",
  "sundry debtors",
]);

/**
 * Reads the Balance Sheet (non-revenue groups + their closing balances) for
 * the period via the inline-TDL engine.
 *
 * Each row is a balance-sheet-side group (those with `$IsRevenue = No`).
 * Side classification is inferred from a curated set of asset-side group
 * names; groups not matching are surfaced as Liabilities (Capital, Loans,
 * Sundry Creditors, Duties & Taxes, Provisions, etc.).
 *
 * `closing` is signed: positive = net debit-side balance, negative = net
 * credit-side balance. The TDL formula already applies the sign flip per
 * `$$IsDebit:$ClosingBalance`.
 */
export async function getBalanceSheet(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<BalanceSheetRow[]> {
  const report = getReport("balance-sheet");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlBsRow>(client, report, template, {
    fromDate: toDate(options.fromDate),
    toDate: toDate(options.toDate),
    targetCompany: options.company,
  });
  return rows.map(toBsRow);
}

function toBsRow(row: TdlBsRow): BalanceSheetRow {
  const parentLower = row.parent.trim().toLowerCase();
  const nameLower = row.group.trim().toLowerCase();
  const side = ASSET_PARENTS.has(parentLower) || ASSET_PARENTS.has(nameLower) ? "Assets" : "Liabilities";
  return BalanceSheetRowSchema.parse({
    side,
    group: row.group,
    subGroup: row.parent.trim() === "" ? undefined : row.parent,
    amount: row.closing,
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
