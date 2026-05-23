import type { WorkbookSpec } from "@tallymcp/excel-engine";
import type {
  AuditLiteResult,
  BalanceSheetRow,
  PnlRow,
  TallyDate,
  TrialBalanceRow,
  Voucher,
} from "@tallymcp/shared-types";

export type DashboardKind = "ManagementSnapshot" | "SalesTrend" | "ExceptionsOverview";

/** Build the Management Snapshot workbook (P&L + TB highlights). */
export function buildManagementSnapshot(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  trialBalance: ReadonlyArray<TrialBalanceRow>;
  profitAndLoss: ReadonlyArray<PnlRow>;
  balanceSheet?: ReadonlyArray<BalanceSheetRow>;
}): WorkbookSpec {
  const summaryRows = [
    {
      metric: "Total Debits (Trial Balance)",
      value: input.trialBalance.reduce((a, r) => a + r.debit, 0),
    },
    {
      metric: "Total Credits (Trial Balance)",
      value: input.trialBalance.reduce((a, r) => a + r.credit, 0),
    },
    {
      metric: "P&L line items",
      value: input.profitAndLoss.length,
    },
    {
      metric: "Balance Sheet line items",
      value: input.balanceSheet?.length ?? 0,
    },
  ];

  return {
    filename: `management-snapshot-${safe(input.company)}-${input.period.from}-${input.period.to}.xlsx`,
    cover: {
      title: "Management Snapshot",
      company: input.company,
      period: input.period,
      generatedAt: input.generatedAt,
    },
    sheets: [
      {
        name: "Summary",
        columns: [
          { header: "Metric", key: "metric", width: 38 },
          { header: "Value", key: "value", width: 20, numberFormat: "currency-inr" },
        ],
        rows: summaryRows,
        freezeRows: 1,
      },
      {
        name: "Trial Balance",
        columns: [
          { header: "Group", key: "groupName", width: 32 },
          { header: "Ledger", key: "ledgerName", width: 32 },
          { header: "Debit", key: "debit", width: 18, numberFormat: "currency-inr" },
          { header: "Credit", key: "credit", width: 18, numberFormat: "currency-inr" },
        ],
        rows: input.trialBalance as unknown as Array<Record<string, unknown>>,
        freezeRows: 1,
        autoFilter: true,
      },
      {
        name: "P&L",
        columns: [
          { header: "Head", key: "head", width: 30 },
          { header: "Sub Head", key: "subHead", width: 24 },
          { header: "Ledger", key: "ledger", width: 30 },
          { header: "Amount", key: "amount", width: 18, numberFormat: "currency-inr" },
        ],
        rows: input.profitAndLoss as unknown as Array<Record<string, unknown>>,
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  };
}

/** Build the Sales Trend dashboard (month-wise sales from voucher set). */
export function buildSalesTrend(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  salesVouchers: ReadonlyArray<Voucher>;
}): WorkbookSpec {
  const byMonth = new Map<string, { month: string; vouchers: number; total: number }>();
  for (const v of input.salesVouchers) {
    const yyyymm = v.date.slice(0, 6);
    const slot = byMonth.get(yyyymm) ?? { month: yyyymm, vouchers: 0, total: 0 };
    slot.vouchers += 1;
    // Sales amount ≈ sum of positive entries (credit side).
    slot.total += v.entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    byMonth.set(yyyymm, slot);
  }
  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

  return {
    filename: `sales-trend-${safe(input.company)}-${input.period.from}-${input.period.to}.xlsx`,
    cover: {
      title: "Sales Trend",
      company: input.company,
      period: input.period,
      generatedAt: input.generatedAt,
    },
    sheets: [
      {
        name: "By Month",
        columns: [
          { header: "Month (YYYYMM)", key: "month", width: 18 },
          { header: "# Sales Vouchers", key: "vouchers", width: 18 },
          { header: "Net Sales", key: "total", width: 20, numberFormat: "currency-inr" },
        ],
        rows: rows as unknown as Array<Record<string, unknown>>,
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  };
}

/** Build the Exceptions Overview dashboard from the latest AuditLiteResult. */
export function buildExceptionsOverview(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  audit: AuditLiteResult;
}): WorkbookSpec {
  const byCode = new Map<string, { code: string; severity: string; count: number }>();
  for (const f of input.audit.findings) {
    const slot = byCode.get(f.code) ?? { code: f.code, severity: f.severity, count: 0 };
    slot.count += 1;
    byCode.set(f.code, slot);
  }

  const summary = [
    { severity: "high", count: input.audit.summary.high },
    { severity: "medium", count: input.audit.summary.medium },
    { severity: "low", count: input.audit.summary.low },
  ];

  return {
    filename: `exceptions-overview-${safe(input.company)}-${input.period.from}-${input.period.to}.xlsx`,
    cover: {
      title: "Exceptions Overview",
      company: input.company,
      period: input.period,
      generatedAt: input.generatedAt,
      extra: {
        "Books score": `${input.audit.booksScore.score} / 100`,
      },
    },
    sheets: [
      {
        name: "By Severity",
        columns: [
          { header: "Severity", key: "severity", width: 12 },
          { header: "Count", key: "count", width: 12 },
        ],
        rows: summary as unknown as Array<Record<string, unknown>>,
        freezeRows: 1,
      },
      {
        name: "By Check",
        columns: [
          { header: "Code", key: "code", width: 36 },
          { header: "Severity", key: "severity", width: 12 },
          { header: "Count", key: "count", width: 12 },
        ],
        rows: [...byCode.values()].sort((a, b) => b.count - a.count) as unknown as Array<
          Record<string, unknown>
        >,
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  };
}

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
