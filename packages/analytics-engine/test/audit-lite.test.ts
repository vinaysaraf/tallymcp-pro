import { describe, expect, it } from "vitest";
import type {
  Group,
  Ledger,
  TrialBalanceRow,
  Voucher,
} from "@tallymcp/shared-types";
import { computeBooksScore } from "../src/books-score.js";
import { runAuditLite, topFindings, AUDIT_DISCLAIMER } from "../src/run-audit-lite.js";
import { AUDIT_LITE_CHECK_COUNT } from "../src/checks.js";
import type { DataQualityContext } from "../src/context.js";

const baseLedger = (over: Partial<Ledger>): Ledger => ({
  name: "L",
  parent: "Current Assets",
  openingBalance: 0,
  ...over,
});

/** A context that triggers every one of the 18 checks at least once. */
function makeDirtyContext(): DataQualityContext {
  const ledgers: Ledger[] = [
    // Duplicates by normalized name
    baseLedger({ name: "Acme & Co", parent: "Sundry Debtors", gstin: "27ACMEC0001Z5" }),
    baseLedger({ name: "ACME  &  Co", parent: "Sundry Debtors" }),
    // Duplicate GSTIN
    baseLedger({ name: "Alpha Ltd", parent: "Sundry Debtors", gstin: "07ABCDE1234F1ZG" }),
    baseLedger({ name: "Beta Ltd", parent: "Sundry Debtors", gstin: "07ABCDE1234F1ZG" }),
    // Material party with no GSTIN, no PAN
    baseLedger({ name: "NoGstParty", parent: "Sundry Creditors" }),
    // Wrong group: creditor under debtors
    baseLedger({ name: "Acme Supplier", parent: "Sundry Debtors" }),
    // Wrong group: debtor under creditors
    baseLedger({ name: "Acme Customer", parent: "Sundry Creditors" }),
    // Tax ledger wrong group
    baseLedger({ name: "CGST Output", parent: "Indirect Expenses" }),
    // Expense under income
    baseLedger({ name: "Freight Expense", parent: "Indirect Incomes" }),
    // Income under expense
    baseLedger({ name: "Sales Revenue", parent: "Direct Expenses" }),
    // GSTIN bad format
    baseLedger({ name: "BadGst Co", parent: "Sundry Debtors", gstin: "INVALID" }),
  ];

  const groups: Group[] = [
    { name: "Sundry Debtors", parent: "Current Assets" },
    { name: "Sundry Creditors", parent: "Current Liabilities" },
    { name: "Direct Expenses", parent: "Primary", isRevenue: true },
    { name: "Indirect Incomes", parent: "Primary", isRevenue: true },
  ];

  const v = (over: Partial<Voucher>): Voucher => ({
    date: "20260615",
    voucherType: "Sales",
    voucherNumber: "S-001",
    narration: "Default narration",
    entries: [
      { ledger: "Cash", amount: -1000, isDeemedPositive: true },
      { ledger: "Sales", amount: 1000, isDeemedPositive: false },
    ],
    ...over,
  });

  // 4 vouchers, ≥1 missing narration, plus 1 backdated, 1 round-figure journal,
  // 1 large manual journal, 1 duplicate-number pair.
  const materialEntries = [
    { ledger: "Cash", amount: -15000, isDeemedPositive: true },
    { ledger: "Sales", amount: 15000, isDeemedPositive: false },
  ];
  const vouchers: Voucher[] = [
    v({ voucherNumber: "S-100", narration: "", entries: materialEntries }), // missing narration (material)
    v({ voucherNumber: "S-101", narration: undefined, entries: materialEntries }), // missing narration
    v({ voucherNumber: "S-100", date: "20260616" }), // duplicate of S-100
    v({
      voucherType: "Journal",
      voucherNumber: "J-1",
      date: "20260701",
      narration: "Round-figure",
      entries: [
        { ledger: "X", amount: -50000, isDeemedPositive: true },
        { ledger: "Y", amount: 50000, isDeemedPositive: false },
      ],
    }), // round figure ₹50,000 (multiple of 10,000) and ≥ ₹10,000 threshold
    v({
      voucherType: "Journal",
      voucherNumber: "J-2",
      date: "20260801",
      narration: "Large adjustment",
      entries: [
        { ledger: "X", amount: -500000, isDeemedPositive: true },
        { ledger: "Y", amount: 500000, isDeemedPositive: false },
      ],
    }), // large manual journal (≥ 10× materiality)
    v({ voucherNumber: "S-OLD", date: "20250115" }), // backdated (before period.from)
  ];

  const trialBalance: TrialBalanceRow[] = [
    // Negative cash
    { groupName: "Cash-in-hand", ledgerName: "Cash", debit: 1000, credit: 5000 },
    // Suspense with balance
    { groupName: "Suspense A/c", ledgerName: "Suspense", debit: 500, credit: 0 },
  ];

  return {
    company: "Acme",
    period: { from: "20260401", to: "20270331" },
    ledgers,
    groups,
    vouchers,
    trialBalance,
  };
}

describe("runAuditLite — full sweep", () => {
  it("registers exactly 18 checks", () => {
    expect(AUDIT_LITE_CHECK_COUNT).toBe(18);
  });

  it("dirty fixture surfaces every expected check code", () => {
    const result = runAuditLite(makeDirtyContext());
    const codes = new Set(result.findings.map((f) => f.code));
    const expected = [
      "DQ.LEDGER.DUPLICATE",
      "DQ.LEDGER.DUPLICATE_GSTIN",
      "DQ.LEDGER.NO_GSTIN",
      "DQ.LEDGER.NO_PAN",
      "DQ.LEDGER.WRONG_GROUP_CREDITOR",
      "DQ.LEDGER.WRONG_GROUP_DEBTOR",
      "DQ.LEDGER.TAX_LEDGER_WRONG_GROUP",
      "DQ.LEDGER.EXPENSE_UNDER_INCOME",
      "DQ.LEDGER.INCOME_UNDER_EXPENSE",
      "DQ.VOUCHER.NO_NARRATION",
      "DQ.VOUCHER.DUPLICATE_NUMBER",
      "DQ.BOOKS.MISSING_NARRATION_RATIO",
      "DQ.BOOKS.ROUND_FIGURE_ENTRIES",
      "DQ.BOOKS.LARGE_MANUAL_JOURNAL",
      "DQ.BOOKS.BACKDATED_ENTRIES",
      "DQ.CASH.NEGATIVE",
      "DQ.SUSPENSE.HAS_BALANCE",
      "DQ.GST.GSTIN_FORMAT_INVALID",
    ];
    for (const code of expected) expect(codes).toContain(code);
  });

  it("yields a non-empty summary and a sub-100 books score", () => {
    const result = runAuditLite(makeDirtyContext());
    expect(result.summary.high + result.summary.medium + result.summary.low).toBeGreaterThan(0);
    expect(result.booksScore.score).toBeLessThan(100);
    expect(result.booksScore.score).toBeGreaterThanOrEqual(0);
  });

  it("returns no findings for a clean fixture (and a perfect score)", () => {
    const clean: DataQualityContext = {
      company: "Acme",
      period: { from: "20260401", to: "20270331" },
      ledgers: [
        baseLedger({ name: "Cash", parent: "Cash-in-hand" }),
        baseLedger({ name: "Sales", parent: "Sales Accounts", isRevenue: true }),
      ],
      groups: [{ name: "Cash-in-hand", parent: "Current Assets" }],
      vouchers: [
        {
          date: "20260415",
          voucherType: "Sales",
          voucherNumber: "S-001",
          narration: "Local sale",
          entries: [
            { ledger: "Cash", amount: -1180, isDeemedPositive: true },
            { ledger: "Sales", amount: 1180, isDeemedPositive: false },
          ],
        },
      ],
      trialBalance: [
        { groupName: "Cash-in-hand", ledgerName: "Cash", debit: 1180, credit: 0 },
      ],
    };
    const result = runAuditLite(clean);
    expect(result.findings).toEqual([]);
    expect(result.booksScore.score).toBe(100);
  });

  it("topFindings sorts by severity and caps at N", () => {
    const result = runAuditLite(makeDirtyContext());
    const top = topFindings(result, 5);
    expect(top.length).toBeLessThanOrEqual(5);
    if (top.length >= 2) {
      const sevOrder = { high: 0, medium: 1, low: 2 } as const;
      for (let i = 1; i < top.length; i++) {
        expect(sevOrder[top[i]!.severity]).toBeGreaterThanOrEqual(sevOrder[top[i - 1]!.severity]);
      }
    }
  });

  it("disclaimer string is non-empty and mentions audit", () => {
    expect(AUDIT_DISCLAIMER).toMatch(/audit/i);
  });
});

describe("computeBooksScore", () => {
  it("returns 100 when there are no findings", () => {
    expect(computeBooksScore([]).score).toBe(100);
  });

  it("never drops below 0 even with massive findings", () => {
    const flood = Array.from({ length: 200 }, (_, i) => ({
      code: `X-${i}`,
      severity: "high" as const,
      title: "T",
      description: "D",
      evidence: [],
      suggestedFix: "F",
    }));
    expect(computeBooksScore(flood).score).toBe(0);
  });
});
