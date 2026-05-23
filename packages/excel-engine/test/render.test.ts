import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { INR_FORMAT, renderWorkbook, type WorkbookSpec } from "../src/index.js";

const FIXTURE_SPEC: WorkbookSpec = {
  filename: "tb.xlsx",
  cover: {
    title: "Trial Balance",
    company: "10000 - Acme Trading",
    period: { from: "20260401", to: "20270331" },
    generatedAt: "2026-05-23T10:00:00.000Z",
    disclaimer: "Analytical only.",
  },
  sheets: [
    {
      name: "Trial Balance",
      columns: [
        { header: "Group", key: "groupName", width: 30 },
        { header: "Ledger", key: "ledgerName", width: 30 },
        { header: "Debit", key: "debit", width: 18, numberFormat: "currency-inr" },
        { header: "Credit", key: "credit", width: 18, numberFormat: "currency-inr" },
      ],
      rows: [
        { groupName: "Sundry Debtors", ledgerName: "Acme & Co", debit: 50000, credit: 0 },
        { groupName: "Sales", ledgerName: "Local Sales", debit: 0, credit: 100000 },
      ],
      freezeRows: 1,
      autoFilter: true,
    },
  ],
  extractionLog: {
    entries: [
      { at: "2026-05-23T09:59:50Z", step: "GET Trial Balance", detail: "2 rows" },
    ],
  },
};

async function readBackBuffer(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

describe("renderWorkbook", () => {
  it("produces a non-empty xlsx Buffer", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it("round-trips: cover, data, extraction-log sheets in expected order", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Cover",
      "Trial Balance",
      "Extraction Log",
    ]);
  });

  it("renders the cover sheet with company, period, generatedAt, disclaimer", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    const cover = wb.getWorksheet("Cover")!;
    const values: string[] = [];
    cover.eachRow((row) => row.eachCell((c) => values.push(String(c.value))));
    expect(values).toContain("Trial Balance");
    expect(values).toContain("10000 - Acme Trading");
    expect(values).toContain("20260401");
    expect(values).toContain("20270331");
    expect(values).toContain("Analytical only.");
  });

  it("writes the data rows under the header", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    const ws = wb.getWorksheet("Trial Balance")!;
    expect(ws.actualRowCount).toBe(3); // header + 2 data rows
    expect(ws.getCell("A2").value).toBe("Sundry Debtors");
    expect(ws.getCell("C2").value).toBe(50000);
  });

  it("applies the Indian currency format to amount columns", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    const ws = wb.getWorksheet("Trial Balance")!;
    // ExcelJS reads numFmt from the column or cell.
    expect(ws.getCell("C2").numFmt).toBe(INR_FORMAT);
    expect(ws.getCell("D2").numFmt).toBe(INR_FORMAT);
  });

  it("freezes the header row when freezeRows is set", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    const ws = wb.getWorksheet("Trial Balance")!;
    expect(ws.views?.[0]?.state).toBe("frozen");
    expect(ws.views?.[0]?.ySplit).toBe(1);
  });

  it("sets an autoFilter on the header band", async () => {
    const buf = await renderWorkbook(FIXTURE_SPEC);
    const wb = await readBackBuffer(buf);
    const ws = wb.getWorksheet("Trial Balance")!;
    expect(ws.autoFilter).toBeDefined();
  });

  it("rejects an invalid spec (Zod validation)", async () => {
    await expect(
      renderWorkbook({
        // @ts-expect-error — invalid: no sheets
        sheets: [],
        filename: "bad.xlsx",
      }),
    ).rejects.toThrow();
  });

  it("rejects sheet names containing forbidden characters", async () => {
    await expect(
      renderWorkbook({
        filename: "bad.xlsx",
        sheets: [
          {
            name: "Bad/Name",
            columns: [{ header: "A", key: "a" }],
            rows: [],
          },
        ],
      }),
    ).rejects.toThrow(/Sheet name/);
  });
});
