import { ROW_STYLE_KEY, type RowStyle } from "@tallymcp/excel-engine";
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

type Row = Record<string, unknown>;
const styled = (row: Row, style: RowStyle): Row => ({ ...row, [ROW_STYLE_KEY]: style });

const lc = (s: string): string => s.toLowerCase();
const fmtPct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const fmtRatio = (x: number | null): string => (x === null ? "n/a" : `${x.toFixed(2)}x`);

/**
 * Derives management KPIs and ratios from the Trial Balance closing balances
 * (each ledger is single-sided Dr/Cr and ties out), classified by group name.
 * The TB is the most reliable, self-consistent source on every Tally edition.
 */
function computeInsights(tb: ReadonlyArray<TrialBalanceRow>) {
  const dr = (pred: (g: string) => boolean): number =>
    tb.filter((r) => pred(lc(r.groupName))).reduce((a, r) => a + r.debit, 0);
  const cr = (pred: (g: string) => boolean): number =>
    tb.filter((r) => pred(lc(r.groupName))).reduce((a, r) => a + r.credit, 0);

  // `\b` so "direct income/expense" don't also match "INdirect …" (which would
  // double-count indirect items in both COGS and opex, understating profit).
  const operatingIncome = (g: string): boolean => /sales account|\bdirect income/.test(g);
  const otherInc = (g: string): boolean => /indirect income/.test(g);
  const directCost = (g: string): boolean => /purchase account|\bdirect expense/.test(g);
  const indirectExp = (g: string): boolean => /indirect expense/.test(g);
  const cashBank = (g: string): boolean => /cash-in-hand|bank account/.test(g);
  const stock = (g: string): boolean => /stock-in-hand/.test(g);
  const curAsset = (g: string): boolean =>
    /sundry debtor|cash-in-hand|bank account|loans & advances \(asset\)|stock-in-hand|current asset|deposit/.test(g);
  const curLiab = (g: string): boolean =>
    /sundry creditor|duties & taxes|provision|current liabilit|bank od/.test(g);
  const loan = (g: string): boolean => /secured loan|unsecured loan/.test(g);
  const capital = (g: string): boolean => /capital account|reserve/.test(g);

  const revenue = cr(operatingIncome);
  const otherIncome = cr(otherInc);
  const cogs = dr(directCost);
  const opex = dr(indirectExp);
  const grossProfit = revenue - cogs;
  const netProfit = revenue + otherIncome - cogs - opex;
  const cash = dr(cashBank);
  const debtors = dr((g) => /sundry debtor/.test(g));
  const creditors = cr((g) => /sundry creditor/.test(g));
  const stockVal = dr(stock);
  const currentAssets = dr(curAsset);
  const currentLiab = cr(curLiab);
  const loans = cr(loan);
  const equity = cr(capital) + netProfit;
  const workingCapital = currentAssets - currentLiab;
  const safeDiv = (a: number, b: number): number | null => (b > 0 ? a / b : null);

  return {
    revenue, otherIncome, cogs, opex, grossProfit, netProfit, cash, debtors, creditors,
    stockVal, currentAssets, currentLiab, loans, equity, workingCapital,
    grossMargin: safeDiv(grossProfit, revenue),
    netMargin: safeDiv(netProfit, revenue),
    currentRatio: safeDiv(currentAssets, currentLiab),
    quickRatio: safeDiv(currentAssets - stockVal, currentLiab),
    debtEquity: safeDiv(loans, equity),
  };
}

/** Build the Management Snapshot workbook — KPIs, ratios, and drill-downs. */
export function buildManagementSnapshot(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  trialBalance: ReadonlyArray<TrialBalanceRow>;
  profitAndLoss: ReadonlyArray<PnlRow>;
  balanceSheet?: ReadonlyArray<BalanceSheetRow>;
}): WorkbookSpec {
  const tb = input.trialBalance;
  const k = computeInsights(tb);
  const debtorParties = tb.filter((r) => /sundry debtor/.test(lc(r.groupName)) && r.debit > 0);
  const creditorParties = tb.filter((r) => /sundry creditor/.test(lc(r.groupName)) && r.credit > 0);

  const profitTone = (n: number): RowStyle => (n >= 0 ? "good" : "bad");
  const ratioTone = (v: number | null, good: number, bad: number): RowStyle =>
    v === null ? "muted" : v >= good ? "good" : v < bad ? "bad" : "info";

  // ── Dashboard: headline ₹ figures ──────────────────────────────────────────
  const kpiRows: Row[] = [
    styled({ metric: "KEY FINANCIALS", amount: null, comment: "" }, "section"),
    styled({ metric: "Revenue (Sales)", amount: k.revenue, comment: "Operating income for the period" }, "kpi"),
    styled({ metric: "Gross Profit", amount: k.grossProfit, comment: `Gross margin ${fmtPct(k.grossMargin)}` }, profitTone(k.grossProfit)),
    styled({ metric: "Net Profit", amount: k.netProfit, comment: `Net margin ${fmtPct(k.netMargin)}` }, profitTone(k.netProfit)),
    styled({ metric: "Cash & Bank", amount: k.cash, comment: "Closing cash + bank balances" }, "kpi"),
    styled({ metric: "Receivables (Debtors)", amount: k.debtors, comment: `${debtorParties.length} parties outstanding` }, "kpi"),
    styled({ metric: "Payables (Creditors)", amount: k.creditors, comment: `${creditorParties.length} parties outstanding` }, "kpi"),
    styled({ metric: "Working Capital", amount: k.workingCapital, comment: k.workingCapital >= 0 ? "Positive — short-term solvency OK" : "Negative — watch liquidity" }, profitTone(k.workingCapital)),
  ];

  // ── Ratios with RAG assessment ──────────────────────────────────────────────
  const ratioRows: Row[] = [
    styled({ metric: "PROFITABILITY", value: "", benchmark: "", assessment: "" }, "section"),
    styled({ metric: "Gross Margin", value: fmtPct(k.grossMargin), benchmark: "Higher is better", assessment: k.grossMargin === null ? "No revenue" : k.grossMargin >= 0.3 ? "Strong" : k.grossMargin >= 0.1 ? "Moderate" : "Thin" }, ratioTone(k.grossMargin, 0.3, 0.1)),
    styled({ metric: "Net Margin", value: fmtPct(k.netMargin), benchmark: "Higher is better", assessment: k.netMargin === null ? "No revenue" : k.netMargin > 0 ? "Profitable" : "Loss-making" }, k.netMargin === null ? "muted" : k.netMargin > 0 ? "good" : "bad"),
    styled({ metric: "LIQUIDITY", value: "", benchmark: "", assessment: "" }, "section"),
    styled({ metric: "Current Ratio", value: fmtRatio(k.currentRatio), benchmark: "≥ 1.5 healthy", assessment: k.currentRatio === null ? "No current liabilities" : k.currentRatio >= 1.5 ? "Healthy" : k.currentRatio >= 1 ? "Adequate" : "Below 1.0 — watch" }, ratioTone(k.currentRatio, 1.5, 1)),
    styled({ metric: "Quick Ratio", value: fmtRatio(k.quickRatio), benchmark: "≥ 1.0 healthy", assessment: k.quickRatio === null ? "n/a" : k.quickRatio >= 1 ? "Healthy" : "Below 1.0" }, ratioTone(k.quickRatio, 1, 0.8)),
    styled({ metric: "Working Capital", value: inr(k.workingCapital), benchmark: "Positive", assessment: k.workingCapital >= 0 ? "Positive" : "Negative" }, profitTone(k.workingCapital)),
    styled({ metric: "LEVERAGE", value: "", benchmark: "", assessment: "" }, "section"),
    styled({ metric: "Debt-Equity", value: fmtRatio(k.debtEquity), benchmark: "< 1.0 conservative", assessment: k.debtEquity === null ? "No borrowings" : k.debtEquity < 1 ? "Conservative" : k.debtEquity <= 2 ? "Moderate" : "High leverage" }, k.debtEquity === null ? "good" : k.debtEquity < 1 ? "good" : k.debtEquity <= 2 ? "info" : "bad"),
  ];

  const topDebtors = [...debtorParties].sort((a, b) => b.debit - a.debit).slice(0, 10)
    .map((r) => ({ ledger: r.ledgerName ?? r.groupName, amount: r.debit }));
  const topCreditors = [...creditorParties].sort((a, b) => b.credit - a.credit).slice(0, 10)
    .map((r) => ({ ledger: r.ledgerName ?? r.groupName, amount: r.credit }));

  const expenseRows = tb.filter((r) => /purchase account|direct expense|indirect expense/.test(lc(r.groupName)) && r.debit > 0);
  const totalExpense = expenseRows.reduce((a, r) => a + r.debit, 0);
  const expenseAnalysis = [...expenseRows].sort((a, b) => b.debit - a.debit).slice(0, 15)
    .map((r) => ({ ledger: r.ledgerName ?? r.groupName, amount: r.debit, share: totalExpense > 0 ? `${((r.debit / totalExpense) * 100).toFixed(1)}%` : "—" }));

  return {
    filename: `management-snapshot-${safe(input.company)}-${input.period.from}-${input.period.to}.xlsx`,
    cover: {
      title: "Management Snapshot",
      company: input.company,
      period: input.period,
      generatedAt: input.generatedAt,
      extra: {
        Revenue: inr(k.revenue),
        "Net Profit": inr(k.netProfit),
        "Net Margin": fmtPct(k.netMargin),
        "Working Capital": inr(k.workingCapital),
      },
    },
    sheets: [
      {
        name: "Dashboard",
        columns: [
          { header: "Metric", key: "metric", width: 30 },
          { header: "Amount (Rs.)", key: "amount", width: 22, numberFormat: "currency-inr", dataBar: true },
          { header: "Comment", key: "comment", width: 46 },
        ],
        rows: kpiRows,
        freezeRows: 1,
      },
      {
        name: "Ratios",
        columns: [
          { header: "Metric", key: "metric", width: 24 },
          { header: "Value", key: "value", width: 14 },
          { header: "Benchmark", key: "benchmark", width: 22 },
          { header: "Assessment", key: "assessment", width: 22 },
        ],
        rows: ratioRows,
        freezeRows: 1,
      },
      {
        name: "Top Debtors",
        columns: [
          { header: "Debtor", key: "ledger", width: 40 },
          { header: "Closing Balance (Dr)", key: "amount", width: 22, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: topDebtors,
        totalsRow: { ledger: "Total receivables", amount: k.debtors },
        freezeRows: 1,
        banded: true,
      },
      {
        name: "Top Creditors",
        columns: [
          { header: "Creditor", key: "ledger", width: 40 },
          { header: "Closing Balance (Cr)", key: "amount", width: 22, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: topCreditors,
        totalsRow: { ledger: "Total payables", amount: k.creditors },
        freezeRows: 1,
        banded: true,
      },
      {
        name: "Expense Analysis",
        columns: [
          { header: "Expense Ledger", key: "ledger", width: 40 },
          { header: "Amount (Rs.)", key: "amount", width: 20, numberFormat: "currency-inr", dataBar: true },
          { header: "Share", key: "share", width: 12 },
        ],
        rows: expenseAnalysis,
        totalsRow: { ledger: "Total expenses", amount: totalExpense, share: "100%" },
        freezeRows: 1,
        banded: true,
      },
      {
        name: "Trial Balance",
        columns: [
          { header: "Group", key: "groupName", width: 32 },
          { header: "Ledger", key: "ledgerName", width: 32 },
          { header: "Debit", key: "debit", width: 18, numberFormat: "currency-inr", dataBar: true },
          { header: "Credit", key: "credit", width: 18, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: tb as unknown as Row[],
        freezeRows: 1,
        autoFilter: true,
        banded: true,
      },
      {
        name: "P&L",
        columns: [
          { header: "Head", key: "head", width: 30 },
          { header: "Sub Head", key: "subHead", width: 24 },
          { header: "Ledger", key: "ledger", width: 30 },
          { header: "Amount", key: "amount", width: 18, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: input.profitAndLoss as unknown as Row[],
        freezeRows: 1,
        autoFilter: true,
        banded: true,
      },
    ],
  };
}

const inr = (n: number): string =>
  `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (yyyymm: string): string => `${MONTHS[Number(yyyymm.slice(4, 6))] ?? "?"}-${yyyymm.slice(0, 4)}`;
const saleValue = (v: Voucher): number => v.entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);

/** Build the Sales Trend dashboard — month-wise trend, growth, top customers. */
export function buildSalesTrend(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  salesVouchers: ReadonlyArray<Voucher>;
}): WorkbookSpec {
  // Month-wise aggregation + month-on-month growth.
  const byMonth = new Map<string, { yyyymm: string; vouchers: number; total: number }>();
  for (const v of input.salesVouchers) {
    const yyyymm = v.date.slice(0, 6);
    const slot = byMonth.get(yyyymm) ?? { yyyymm, vouchers: 0, total: 0 };
    slot.vouchers += 1;
    slot.total += saleValue(v);
    byMonth.set(yyyymm, slot);
  }
  const months = [...byMonth.values()].sort((a, b) => a.yyyymm.localeCompare(b.yyyymm));
  const monthRows: Row[] = months.map((m, i) => {
    const prev = months[i - 1]?.total;
    const growth = prev && prev > 0 ? (m.total - prev) / prev : null;
    return {
      month: monthLabel(m.yyyymm),
      vouchers: m.vouchers,
      total: m.total,
      growth: growth === null ? "—" : `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}%`,
    };
  });

  // Headline KPIs.
  const totalSales = months.reduce((a, m) => a + m.total, 0);
  const totalInvoices = months.reduce((a, m) => a + m.vouchers, 0);
  const avgInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;
  const best = [...months].sort((a, b) => b.total - a.total)[0];

  // Top customers by sales value.
  const byParty = new Map<string, { party: string; vouchers: number; total: number }>();
  for (const v of input.salesVouchers) {
    const party = v.party?.trim() || "(unspecified)";
    const slot = byParty.get(party) ?? { party, vouchers: 0, total: 0 };
    slot.vouchers += 1;
    slot.total += saleValue(v);
    byParty.set(party, slot);
  }
  const topCustomers = [...byParty.values()].sort((a, b) => b.total - a.total).slice(0, 10);

  const kpiRows: Row[] = [
    styled({ metric: "SALES SUMMARY", amount: null, detail: "" }, "section"),
    styled({ metric: "Total Net Sales", amount: totalSales, detail: `${monthLabel(input.period.from.slice(0, 6))} onwards` }, "kpi"),
    styled({ metric: "Invoices", amount: totalInvoices, detail: "Number of sales vouchers" }, "kpi"),
    styled({ metric: "Average Invoice Value", amount: Math.round(avgInvoice), detail: "Net sales ÷ invoices" }, "kpi"),
    styled({ metric: "Best Month", amount: best?.total ?? 0, detail: best ? monthLabel(best.yyyymm) : "—" }, "good"),
    styled({ metric: "Active Customers", amount: byParty.size, detail: "Distinct billed parties" }, "info"),
  ];

  return {
    filename: `sales-trend-${safe(input.company)}-${input.period.from}-${input.period.to}.xlsx`,
    cover: {
      title: "Sales Trend",
      company: input.company,
      period: input.period,
      generatedAt: input.generatedAt,
      extra: { "Total Net Sales": inr(totalSales), Invoices: String(totalInvoices), "Avg Invoice": inr(avgInvoice) },
    },
    sheets: [
      {
        name: "Summary",
        columns: [
          { header: "Metric", key: "metric", width: 26 },
          { header: "Amount (Rs.)", key: "amount", width: 20, numberFormat: "currency-inr", dataBar: true },
          { header: "Detail", key: "detail", width: 36 },
        ],
        rows: kpiRows,
        freezeRows: 1,
      },
      {
        name: "By Month",
        columns: [
          { header: "Month", key: "month", width: 14 },
          { header: "# Invoices", key: "vouchers", width: 12 },
          { header: "Net Sales", key: "total", width: 20, numberFormat: "currency-inr", dataBar: true },
          { header: "MoM Growth", key: "growth", width: 14 },
        ],
        rows: monthRows,
        totalsRow: { month: "TOTAL", vouchers: totalInvoices, total: totalSales, growth: "" },
        freezeRows: 1,
        banded: true,
      },
      {
        name: "Top Customers",
        columns: [
          { header: "Customer", key: "party", width: 40 },
          { header: "# Invoices", key: "vouchers", width: 12 },
          { header: "Net Sales", key: "total", width: 20, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: topCustomers as unknown as Row[],
        totalsRow: { party: "Total (all customers)", vouchers: totalInvoices, total: totalSales },
        freezeRows: 1,
        banded: true,
      },
    ],
  };
}

const severityTone = (s: string): RowStyle => (s === "high" ? "bad" : s === "medium" ? "info" : "muted");

/** Build the Exceptions Overview dashboard from the latest AuditLiteResult. */
export function buildExceptionsOverview(input: {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  generatedAt: string;
  audit: AuditLiteResult;
}): WorkbookSpec {
  const byCode = new Map<string, { code: string; severity: string; title: string; count: number }>();
  for (const f of input.audit.findings) {
    const slot = byCode.get(f.code) ?? { code: f.code, severity: f.severity, title: f.title, count: 0 };
    slot.count += 1;
    byCode.set(f.code, slot);
  }

  const s = input.audit.summary;
  const total = s.high + s.medium + s.low;
  const summaryRows: Row[] = [
    styled({ severity: "High", count: s.high }, "bad"),
    styled({ severity: "Medium", count: s.medium }, "info"),
    styled({ severity: "Low", count: s.low }, "muted"),
    styled({ severity: "TOTAL", count: total }, "total"),
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
        "Total findings": String(total),
        "High / Medium / Low": `${s.high} / ${s.medium} / ${s.low}`,
      },
    },
    sheets: [
      {
        name: "By Severity",
        columns: [
          { header: "Severity", key: "severity", width: 14 },
          { header: "Count", key: "count", width: 12, numberFormat: "integer", dataBar: true },
        ],
        rows: summaryRows,
        freezeRows: 1,
      },
      {
        name: "By Check",
        columns: [
          { header: "Code", key: "code", width: 34 },
          { header: "Severity", key: "severity", width: 12 },
          { header: "Title", key: "title", width: 40 },
          { header: "Count", key: "count", width: 10, numberFormat: "integer", dataBar: true },
        ],
        rows: [...byCode.values()]
          .sort((a, b) => b.count - a.count)
          .map((r) => styled({ ...r }, severityTone(r.severity))),
        freezeRows: 1,
        autoFilter: true,
      },
      {
        name: "Findings",
        columns: [
          { header: "Severity", key: "severity", width: 12 },
          { header: "Code", key: "code", width: 32 },
          { header: "Title", key: "title", width: 38 },
          { header: "Evidence", key: "evidence", width: 44 },
          { header: "Suggested Fix", key: "suggestedFix", width: 50 },
        ],
        rows: input.audit.findings.map((f) =>
          styled(
            { severity: f.severity, code: f.code, title: f.title, evidence: f.evidence.join(" | "), suggestedFix: f.suggestedFix },
            severityTone(f.severity),
          ),
        ),
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  };
}

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
