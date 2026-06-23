import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ReadReportResult, ReportId } from "@tallymcp/shared-types";
import { renderWorkbook, toWorkbookSpec } from "../src/index.js";

function makeResult(
  reportId: ReportId,
  rows: Array<Record<string, unknown>>,
  period?: { from: string; to: string },
): ReadReportResult {
  return {
    status: "ok",
    meta: {
      reportId,
      company: "10000 - Acme Trading",
      period,
      generatedAt: "2026-05-23T10:00:00.000Z",
    },
    rows,
    warnings: [],
    lineErrors: [],
  };
}

describe("toWorkbookSpec", () => {
  it("picks Trial Balance columns and amount formats", () => {
    const spec = toWorkbookSpec(
      makeResult(
        "TrialBalance",
        [{ groupName: "Sundry Debtors", debit: 50000, credit: 0 }],
        { from: "20260401", to: "20270331" },
      ),
    );
    expect(spec.sheets[0]?.name).toBe("Trial Balance");
    const debit = spec.sheets[0]?.columns.find((c) => c.key === "debit");
    expect(debit?.numberFormat).toBe("currency-inr");
    expect(spec.cover?.period).toEqual({ from: "20260401", to: "20270331" });
  });

  it("emits a sheet name within Excel's 31-char limit", () => {
    const spec = toWorkbookSpec(makeResult("ListOfCompanies", []));
    for (const sheet of spec.sheets) expect(sheet.name.length).toBeLessThanOrEqual(31);
  });

  it("filename is reportId-prefixed and disk-safe", () => {
    const spec = toWorkbookSpec(makeResult("LedgerMasters", []));
    expect(spec.filename.startsWith("LedgerMasters-")).toBe(true);
    expect(spec.filename.endsWith(".xlsx")).toBe(true);
    expect(spec.filename).not.toMatch(/[:]/);
  });

  it("adds the audit disclaimer when options.disclaimer is set", () => {
    const spec = toWorkbookSpec(makeResult("DayBook", []), { disclaimer: true });
    expect(spec.cover?.disclaimer).toMatch(/Analytical/);
  });

  it("omits the disclaimer by default", () => {
    expect(toWorkbookSpec(makeResult("TrialBalance", [])).cover?.disclaimer).toBeUndefined();
  });

  const allReports: ReportId[] = [
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
  ];

  for (const reportId of allReports) {
    it(`renders ${reportId} end-to-end through renderWorkbook`, async () => {
      const spec = toWorkbookSpec(makeResult(reportId, []));
      const buf = await renderWorkbook(spec);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      expect(wb.worksheets.length).toBeGreaterThanOrEqual(2); // cover + data
    });
  }
});
