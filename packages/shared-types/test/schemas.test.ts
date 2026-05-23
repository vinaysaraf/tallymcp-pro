import { describe, expect, it } from "vitest";
import {
  BalanceSheetRowSchema,
  CompanySchema,
  FindingSchema,
  PnlRowSchema,
  ReadReportRequestSchema,
  ReadReportResultSchema,
  ReportIdSchema,
  TrialBalanceRowSchema,
  VoucherLineSchema,
  VoucherSchema,
} from "../src/index.js";

describe("VoucherLineSchema", () => {
  it("parses a complete debit line", () => {
    expect(
      VoucherLineSchema.parse({ ledger: "Cash", amount: 1000, isDeemedPositive: true }),
    ).toEqual({ ledger: "Cash", amount: 1000, isDeemedPositive: true });
  });

  it("rejects missing required fields", () => {
    expect(VoucherLineSchema.safeParse({ ledger: "Cash", amount: 100 }).success).toBe(false);
    expect(VoucherLineSchema.safeParse({ amount: 100, isDeemedPositive: false }).success).toBe(false);
  });
});

describe("VoucherSchema", () => {
  const minimal = {
    date: "20260401",
    voucherType: "Sales",
    entries: [
      { ledger: "Cash", amount: 1000, isDeemedPositive: true },
      { ledger: "Sales", amount: 1000, isDeemedPositive: false },
    ],
  };

  it("parses a minimal voucher", () => {
    const parsed = VoucherSchema.parse(minimal);
    expect(parsed.date).toBe("20260401");
    expect(parsed.entries).toHaveLength(2);
  });

  it("accepts optional voucherNumber, narration, party, reference", () => {
    const parsed = VoucherSchema.parse({
      ...minimal,
      voucherNumber: "S-001",
      narration: "Cash sale",
      party: "Walk-in",
      reference: "INV-1",
    });
    expect(parsed.narration).toBe("Cash sale");
    expect(parsed.party).toBe("Walk-in");
    expect(parsed.reference).toBe("INV-1");
  });

  it("rejects an invalid Tally date", () => {
    expect(VoucherSchema.safeParse({ ...minimal, date: "2026-04-01" }).success).toBe(false);
  });

  it("rejects a voucher with no entries", () => {
    expect(VoucherSchema.safeParse({ ...minimal, entries: [] }).success).toBe(false);
  });
});

describe("TrialBalanceRowSchema", () => {
  it("parses a group row with no ledger", () => {
    expect(
      TrialBalanceRowSchema.parse({ groupName: "Sundry Debtors", debit: 50000, credit: 0 }),
    ).toEqual({ groupName: "Sundry Debtors", debit: 50000, credit: 0 });
  });

  it("parses a ledger row under a group", () => {
    const row = TrialBalanceRowSchema.parse({
      groupName: "Sundry Debtors",
      ledgerName: "Acme & Co",
      debit: 12000,
      credit: 0,
    });
    expect(row.ledgerName).toBe("Acme & Co");
  });
});

describe("PnlRowSchema", () => {
  it("parses a head total row", () => {
    expect(PnlRowSchema.parse({ head: "Sales Accounts", amount: 1500000 })).toEqual({
      head: "Sales Accounts",
      amount: 1500000,
    });
  });

  it("parses a leaf ledger row with subHead and ledger", () => {
    const row = PnlRowSchema.parse({
      head: "Direct Expenses",
      subHead: "Freight",
      ledger: "Inward Freight",
      amount: 25000,
    });
    expect(row.subHead).toBe("Freight");
    expect(row.ledger).toBe("Inward Freight");
  });
});

describe("BalanceSheetRowSchema", () => {
  it("parses an Assets-side row", () => {
    const row = BalanceSheetRowSchema.parse({
      side: "Assets",
      group: "Current Assets",
      amount: 250000,
    });
    expect(row.side).toBe("Assets");
  });

  it("rejects an invalid side", () => {
    expect(
      BalanceSheetRowSchema.safeParse({ side: "Equity", group: "Capital", amount: 1 }).success,
    ).toBe(false);
  });
});

describe("ReportIdSchema", () => {
  it("accepts all ten submission report ids", () => {
    for (const id of [
      "CompanyInfo",
      "ListOfCompanies",
      "LedgerMasters",
      "GroupMasters",
      "VoucherTypes",
      "DayBook",
      "TrialBalance",
      "ProfitAndLoss",
      "BalanceSheet",
      "SalesRegister",
    ]) {
      expect(ReportIdSchema.parse(id)).toBe(id);
    }
  });

  it("rejects an unknown report id", () => {
    expect(ReportIdSchema.safeParse("ReceiptRegister").success).toBe(false);
  });
});

describe("ReadReportRequestSchema", () => {
  it("parses a minimal request with only reportId", () => {
    const req = ReadReportRequestSchema.parse({ reportId: "ListOfCompanies" });
    expect(req.reportId).toBe("ListOfCompanies");
  });

  it("parses a full period request", () => {
    const req = ReadReportRequestSchema.parse({
      reportId: "TrialBalance",
      company: "10000 - Acme",
      fromDate: "20260401",
      toDate: "20270331",
      format: "excel",
    });
    expect(req.format).toBe("excel");
  });

  it("rejects an invalid date format", () => {
    expect(
      ReadReportRequestSchema.safeParse({ reportId: "DayBook", fromDate: "2026-04-01" }).success,
    ).toBe(false);
  });
});

describe("ReadReportResultSchema", () => {
  it("parses a minimal ok result", () => {
    const res = ReadReportResultSchema.parse({
      status: "ok",
      meta: { reportId: "ListOfCompanies", generatedAt: "2026-05-23T10:00:00.000Z" },
      rows: [],
      warnings: [],
      lineErrors: [],
    });
    expect(res.status).toBe("ok");
  });

  it("rejects an unknown status", () => {
    expect(
      ReadReportResultSchema.safeParse({
        status: "fine",
        meta: { reportId: "X", generatedAt: "now" },
        rows: [],
        warnings: [],
        lineErrors: [],
      }).success,
    ).toBe(false);
  });
});

describe("FindingSchema", () => {
  it("parses a complete finding", () => {
    const f = FindingSchema.parse({
      code: "DQ.LEDGER.DUPLICATE",
      severity: "high",
      title: "Duplicate ledger names",
      description: "Two ledgers with identical normalized names.",
      evidence: ["Acme", "ACME"],
      suggestedFix: "Merge or rename.",
    });
    expect(f.severity).toBe("high");
    expect(f.evidence).toHaveLength(2);
  });

  it("rejects an invalid severity", () => {
    expect(
      FindingSchema.safeParse({
        code: "X",
        severity: "critical",
        title: "T",
        description: "D",
        evidence: [],
        suggestedFix: "F",
      }).success,
    ).toBe(false);
  });
});

describe("CompanySchema (existing — sanity)", () => {
  it("still accepts a valid company", () => {
    expect(
      CompanySchema.parse({
        id: "10000 - Acme",
        name: "Acme Trading",
        startingFrom: "20260401",
      }).baseCurrency,
    ).toBe("INR");
  });
});
