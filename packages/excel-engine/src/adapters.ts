import type { ReadReportResult } from "@tallymcp/shared-types";
import type { ColumnSpec, WorkbookSpec } from "./spec.js";

const AUDIT_DISCLAIMER =
  "Analytical support only — not a statutory audit opinion. Verify each finding against source records.";

/**
 * Builds a {@link WorkbookSpec} for any of the 10 in-scope reports. The caller
 * picks the report by `result.meta.reportId`; this function chooses column
 * layout, number formats, and freeze/filter behaviour appropriately.
 */
export function toWorkbookSpec(
  result: ReadReportResult,
  options: { disclaimer?: boolean } = {},
): WorkbookSpec {
  const reportId = result.meta.reportId;
  const layout = LAYOUTS[reportId] ?? GENERIC_LAYOUT;
  const filename = `${reportId}-${result.meta.generatedAt.replace(/[:.]/g, "-")}.xlsx`;

  return {
    filename,
    cover: {
      title: reportId,
      company: result.meta.company,
      period: result.meta.period,
      generatedAt: result.meta.generatedAt,
      disclaimer: options.disclaimer ? AUDIT_DISCLAIMER : undefined,
    },
    sheets: [
      {
        name: clampSheetName(layout.sheetName),
        columns: layout.columns,
        rows: toSheetRows(reportId, result.rows),
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  };
}

interface VoucherEntryLike {
  ledger?: string;
  amount?: number;
  isDeemedPositive?: boolean;
}
interface VoucherLike {
  date?: string;
  voucherType?: string;
  voucherNumber?: string;
  party?: string;
  narration?: string;
  entries?: VoucherEntryLike[];
}

/**
 * Maps report rows to sheet rows. Most reports are 1:1, but the Day Book is
 * exploded: each voucher becomes one row per ledger posting, with the entry's
 * amount split into Debit/Credit by `isDeemedPositive` (true = debit). The
 * voucher-level Date/Type/Number/Party/Narration repeat on every line so the
 * sheet stays filterable.
 */
function toSheetRows(
  reportId: string,
  rows: ReadReportResult["rows"],
): Array<Record<string, unknown>> {
  if (reportId !== "DayBook") return rows as Array<Record<string, unknown>>;
  const out: Array<Record<string, unknown>> = [];
  for (const v of rows as VoucherLike[]) {
    const entries = v.entries?.length ? v.entries : [{ ledger: v.party, amount: 0, isDeemedPositive: true }];
    for (const e of entries) {
      const magnitude = Math.abs(e.amount ?? 0);
      out.push({
        date: v.date,
        voucherType: v.voucherType,
        voucherNumber: v.voucherNumber,
        party: v.party,
        ledger: e.ledger,
        debit: e.isDeemedPositive ? magnitude : null,
        credit: e.isDeemedPositive ? null : magnitude,
        narration: v.narration,
      });
    }
  }
  return out;
}

interface ReportLayout {
  sheetName: string;
  columns: ColumnSpec[];
}

const LAYOUTS: Record<string, ReportLayout> = {
  ListOfCompanies: {
    sheetName: "Companies",
    columns: [
      { header: "ID", key: "id", width: 30 },
      { header: "Name", key: "name", width: 40 },
      { header: "FY Starts", key: "startingFrom", width: 14 },
      { header: "Base Currency", key: "baseCurrency", width: 14 },
      { header: "GSTIN", key: "gstin", width: 20 },
    ],
  },
  CompanyInfo: {
    sheetName: "Company",
    columns: [
      { header: "ID", key: "id", width: 30 },
      { header: "Name", key: "name", width: 40 },
      { header: "FY Starts", key: "startingFrom", width: 14 },
      { header: "Books From", key: "booksFrom", width: 14 },
      { header: "Base Currency", key: "baseCurrency", width: 14 },
      { header: "GSTIN", key: "gstin", width: 20 },
    ],
  },
  LedgerMasters: {
    sheetName: "Ledgers",
    columns: [
      { header: "Name", key: "name", width: 40 },
      { header: "Parent Group", key: "parent", width: 28 },
      { header: "Opening Balance", key: "openingBalance", width: 18, numberFormat: "currency-inr" },
      { header: "Revenue?", key: "isRevenue", width: 10 },
      { header: "Dr-positive?", key: "isDeemedPositive", width: 14 },
      { header: "GSTIN", key: "gstin", width: 20 },
      { header: "PAN", key: "panNumber", width: 14 },
    ],
  },
  GroupMasters: {
    sheetName: "Groups",
    columns: [
      { header: "Name", key: "name", width: 40 },
      { header: "Parent", key: "parent", width: 28 },
      { header: "Revenue?", key: "isRevenue", width: 10 },
      { header: "Affects Gross Profit?", key: "affectsGrossProfit", width: 22 },
    ],
  },
  VoucherTypes: {
    sheetName: "Voucher Types",
    columns: [
      { header: "Name", key: "name", width: 32 },
      { header: "Parent", key: "parent", width: 24 },
      { header: "Numbering", key: "numberingMethod", width: 24 },
    ],
  },
  DayBook: {
    sheetName: "Day Book",
    // One row per ledger posting (the voucher is exploded across its entries).
    columns: [
      { header: "Date", key: "date", width: 12 },
      { header: "Type", key: "voucherType", width: 18 },
      { header: "Number", key: "voucherNumber", width: 14 },
      { header: "Party", key: "party", width: 26 },
      { header: "Ledger", key: "ledger", width: 28 },
      { header: "Debit", key: "debit", width: 16, numberFormat: "currency-inr" },
      { header: "Credit", key: "credit", width: 16, numberFormat: "currency-inr" },
      { header: "Narration", key: "narration", width: 50 },
    ],
  },
  TrialBalance: {
    sheetName: "Trial Balance",
    columns: [
      { header: "Group", key: "groupName", width: 30 },
      { header: "Ledger", key: "ledgerName", width: 30 },
      { header: "Debit", key: "debit", width: 18, numberFormat: "currency-inr" },
      { header: "Credit", key: "credit", width: 18, numberFormat: "currency-inr" },
    ],
  },
  ProfitAndLoss: {
    sheetName: "P&L",
    columns: [
      { header: "Head", key: "head", width: 30 },
      { header: "Sub Head", key: "subHead", width: 24 },
      { header: "Ledger", key: "ledger", width: 30 },
      { header: "Amount", key: "amount", width: 18, numberFormat: "currency-inr" },
    ],
  },
  BalanceSheet: {
    sheetName: "Balance Sheet",
    columns: [
      { header: "Side", key: "side", width: 14 },
      { header: "Group", key: "group", width: 30 },
      { header: "Amount", key: "amount", width: 20, numberFormat: "currency-inr" },
    ],
  },
  SalesRegister: {
    // Invoice-level summary (one row per sales voucher). Per-line ledger
    // postings for sales vouchers appear in the Day Book.
    sheetName: "Sales Register",
    columns: [
      { header: "Date", key: "date", width: 12 },
      { header: "Number", key: "voucherNumber", width: 16 },
      { header: "Party", key: "party", width: 32 },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Amount", key: "amount", width: 18, numberFormat: "currency-inr" },
      { header: "Narration", key: "narration", width: 50 },
    ],
  },
};

const GENERIC_LAYOUT: ReportLayout = {
  sheetName: "Data",
  columns: [{ header: "Value", key: "value", width: 60 }],
};

function clampSheetName(name: string): string {
  // Excel forbids these characters; also clamp length to 31.
  const cleaned = name.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
  return cleaned.length === 0 ? "Sheet1" : cleaned;
}
