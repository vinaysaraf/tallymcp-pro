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

  // Tally returns every balance-sheet group — primary groups AND their
  // sub-groups — each carrying its own aggregate closing. A parent's closing
  // already includes its children, so summing the flat list double-counts and
  // the sheet never ties. Keep only primary (top-level) groups; `parent` is ""
  // for a primary group (Fld02 blanks it). Drop zero-balance groups to match
  // how Tally presents the Balance Sheet.
  const primary = rows
    .filter((r) => r.parent.trim() === "")
    .map(toBsRow)
    .filter((r) => Math.abs(r.amount) >= 0.005);

  // Double-entry makes every primary group's signed closing sum to zero across
  // the whole company (the Trial Balance ties: Dr = Cr). The non-revenue
  // groups alone fall short by exactly the brought-forward P&L A/c balance plus
  // the current period's profit/loss — the figure Tally surfaces on the BS as
  // "Profit & Loss A/c". Append it as the balancing line so the sheet ties out.
  const plug = -primary.reduce((sum, r) => sum + r.amount, 0);
  if (Math.abs(plug) >= 0.005) {
    primary.push(
      BalanceSheetRowSchema.parse({
        side: plug >= 0 ? "Liabilities" : "Assets",
        group: "Profit & Loss A/c",
        amount: plug,
      }),
    );
  }
  return primary;
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
