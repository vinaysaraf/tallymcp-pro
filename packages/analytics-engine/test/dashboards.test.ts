import { describe, expect, it } from "vitest";
import { renderWorkbook } from "@tallymcp/excel-engine";
import type { TrialBalanceRow } from "@tallymcp/shared-types";
import { buildManagementSnapshot } from "../src/dashboards.js";

const TB: TrialBalanceRow[] = [
  { groupName: "Sales Accounts", ledgerName: "Sales", debit: 0, credit: 1_000_000 },
  { groupName: "Purchase Accounts", ledgerName: "Purchases", debit: 600_000, credit: 0 },
  { groupName: "Indirect Expenses", ledgerName: "Rent", debit: 100_000, credit: 0 },
  { groupName: "Bank Accounts", ledgerName: "HDFC", debit: 500_000, credit: 0 },
  { groupName: "Sundry Debtors", ledgerName: "Customer A", debit: 300_000, credit: 0 },
  { groupName: "Sundry Creditors", ledgerName: "Supplier A", debit: 0, credit: 200_000 },
  { groupName: "Capital Account", ledgerName: "Capital", debit: 0, credit: 800_000 },
];

const SNAP = buildManagementSnapshot({
  company: "Acme",
  period: { from: "20250401" as never, to: "20260331" as never },
  generatedAt: "2026-06-24T00:00:00Z",
  trialBalance: TB,
  profitAndLoss: [],
});

const sheet = (name: string) => SNAP.sheets.find((s) => s.name === name);
const cell = (name: string, metric: string, key: string) =>
  (sheet(name)!.rows as Record<string, unknown>[]).find((r) => r.metric === metric)?.[key];

describe("buildManagementSnapshot", () => {
  it("emits the insight sheets", () => {
    const names = SNAP.sheets.map((s) => s.name);
    expect(names).toEqual([
      "Dashboard",
      "Ratios",
      "Top Debtors",
      "Top Creditors",
      "Expense Analysis",
      "Trial Balance",
      "P&L",
    ]);
  });

  it("derives revenue, gross/net profit from the trial balance", () => {
    expect(cell("Dashboard", "Revenue (Sales)", "amount")).toBe(1_000_000);
    expect(cell("Dashboard", "Gross Profit", "amount")).toBe(400_000); // 1,000,000 − 600,000 COGS
    expect(cell("Dashboard", "Net Profit", "amount")).toBe(300_000); // − 100,000 opex
  });

  it("computes liquidity ratios with RAG assessment", () => {
    // Current assets (debtors 300k + bank 500k) / current liabilities (creditors 200k) = 4.0x
    expect(cell("Ratios", "Current Ratio", "value")).toBe("4.00x");
    expect(cell("Ratios", "Current Ratio", "assessment")).toBe("Healthy");
    expect(cell("Ratios", "Net Margin", "value")).toBe("30.0%");
  });

  it("lists top debtors and creditors", () => {
    expect(sheet("Top Debtors")!.rows[0]).toMatchObject({ ledger: "Customer A", amount: 300_000 });
    expect(sheet("Top Creditors")!.rows[0]).toMatchObject({ ledger: "Supplier A", amount: 200_000 });
  });

  it("renders to a non-empty workbook", async () => {
    const buf = await renderWorkbook(SNAP);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
