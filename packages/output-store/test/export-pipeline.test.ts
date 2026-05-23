import ExcelJS from "exceljs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TallyClient } from "@tallymcp/report-engine";
import type { ReadReportResult } from "@tallymcp/shared-types";
import { exportMasters, exportReport, exportVouchers, UTF8_BOM } from "../src/index.js";

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "tallymcp-output-"));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

function stubClient(responses: string | string[]): TallyClient & { calls: string[] } {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      const r = queue.shift();
      if (r === undefined) throw new Error("StubClient: no more responses queued");
      return r;
    },
  };
}

function wrap(inner: string): string {
  return `<ENVELOPE><BODY><DATA>${inner}</DATA></BODY></ENVELOPE>`;
}

function voucherXml(date: string, num: string): string {
  return `<VOUCHER VCHTYPE="Sales">
    <DATE>${date}</DATE>
    <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${num}</VOUCHERNUMBER>
    <NARRATION>Sale</NARRATION>
    <PARTYLEDGERNAME>Acme &amp; Co</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Acme &amp; Co</LEDGERNAME>
      <AMOUNT>-1,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Sales</LEDGERNAME>
      <AMOUNT>1,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>`;
}

function fakeResult(): ReadReportResult {
  return {
    status: "ok",
    meta: {
      reportId: "TrialBalance",
      company: "10000 - Acme Trading",
      period: { from: "20260401", to: "20270331" },
      generatedAt: "2026-05-23T10:00:00.000Z",
    },
    rows: [{ groupName: "Sundry Debtors", debit: 50000, credit: 0 }],
    warnings: [],
    lineErrors: [],
  };
}

describe("exportReport", () => {
  it("writes an .xlsx file and returns a sized GeneratedFile", async () => {
    const out = await exportReport(fakeResult(), { format: "excel", outputDir: scratchDir });
    expect(out.fileName.endsWith(".xlsx")).toBe(true);
    expect(out.mimeType).toMatch(/spreadsheetml/);
    expect(out.sizeBytes).toBeGreaterThan(1000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(out.path));
    expect(wb.getWorksheet("Trial Balance")).toBeDefined();
  });

  it("writes a .json file containing the full result", async () => {
    const out = await exportReport(fakeResult(), { format: "json", outputDir: scratchDir });
    expect(out.mimeType).toBe("application/json");
    const parsed = JSON.parse(readFileSync(out.path, "utf8"));
    expect(parsed.meta.reportId).toBe("TrialBalance");
    expect(parsed.rows).toHaveLength(1);
  });

  it("applies the audit disclaimer when requested", async () => {
    const out = await exportReport(fakeResult(), {
      format: "excel",
      outputDir: scratchDir,
      disclaimer: true,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(out.path));
    const cover = wb.getWorksheet("Cover")!;
    const values: string[] = [];
    cover.eachRow((row) => row.eachCell((c) => values.push(String(c.value))));
    expect(values.some((v) => v.startsWith("Analytical"))).toBe(true);
  });
});

const LEDGERS_XML = wrap(
  `<COLLECTION NAME="List of Ledgers"><LEDGER NAME="Cash"><NAME>Cash</NAME><PARENT>Cash-in-hand</PARENT><OPENINGBALANCE>10,000</OPENINGBALANCE></LEDGER></COLLECTION>`,
);
const GROUPS_XML = wrap(
  `<COLLECTION NAME="List of Groups"><GROUP NAME="Sundry Debtors"><NAME>Sundry Debtors</NAME><PARENT>Current Assets</PARENT></GROUP></COLLECTION>`,
);
const VTYPES_XML = wrap(
  `<COLLECTION NAME="List of Voucher Types"><VOUCHERTYPE NAME="Sales"><NAME>Sales</NAME><PARENT>Sales</PARENT><NUMBERINGMETHOD>Automatic</NUMBERINGMETHOD></VOUCHERTYPE></COLLECTION>`,
);

describe("exportMasters", () => {
  it("writes one multi-sheet workbook plus a CSV per master", async () => {
    // Parallel: 3 calls in any order.
    const client = stubClient([LEDGERS_XML, GROUPS_XML, VTYPES_XML]);
    const result = await exportMasters(client, { company: "Acme", outputDir: scratchDir });
    expect(result.workbook.fileName).toBe("Acme-masters.xlsx");
    expect(result.csvs).toHaveLength(3);
    const csvNames = result.csvs.map((f) => f.fileName).sort();
    expect(csvNames).toEqual([
      "Acme-groups.csv",
      "Acme-ledgers.csv",
      "Acme-voucher-types.csv",
    ]);
    // Workbook has three data sheets.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(result.workbook.path));
    expect(wb.getWorksheet("Ledgers")).toBeDefined();
    expect(wb.getWorksheet("Groups")).toBeDefined();
    expect(wb.getWorksheet("Voucher Types")).toBeDefined();
  });

  it("CSVs are UTF-8 with BOM and have a header row", async () => {
    const client = stubClient([LEDGERS_XML, GROUPS_XML, VTYPES_XML]);
    const result = await exportMasters(client, { company: "Acme", outputDir: scratchDir });
    const ledgerCsv = readFileSync(
      result.csvs.find((c) => c.fileName === "Acme-ledgers.csv")!.path,
      "utf8",
    );
    expect(ledgerCsv.startsWith(UTF8_BOM)).toBe(true);
    const headerLine = ledgerCsv.slice(UTF8_BOM.length).split(/\r\n/)[0]!;
    expect(headerLine.startsWith("Name,")).toBe(true); // header begins with the Name column
  });
});

describe("exportVouchers (streaming CSV)", () => {
  it("writes header + one row per ledger entry across chunks", async () => {
    const client = stubClient([
      wrap(voucherXml("20260402", "A")),
      wrap(voucherXml("20260408", "B")),
    ]);
    const out = await exportVouchers(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260408",
      outputDir: scratchDir,
    });
    expect(client.calls).toHaveLength(2); // 2 chunks (8-day range)
    const csv = readFileSync(out.path, "utf8");
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    const lines = csv.slice(UTF8_BOM.length).split(/\r\n/).filter((l) => l.length > 0);
    expect(lines[0]).toBe(
      "Date,Voucher Type,Voucher Number,Party,Reference,Narration,Ledger,Amount,Is Deemed Positive",
    );
    expect(lines).toHaveLength(1 + 2 * 2); // header + 2 vouchers × 2 entries each
  });

  it("survives an empty range with header-only output", async () => {
    const client = stubClient(wrap(""));
    const out = await exportVouchers(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260401",
      outputDir: scratchDir,
    });
    const csv = readFileSync(out.path, "utf8");
    const lines = csv.slice(UTF8_BOM.length).split(/\r\n/).filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
  });

  it("escapes commas and quotes inside party/narration", async () => {
    const v = `<VOUCHER VCHTYPE="Sales">
      <DATE>20260403</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>S-1</VOUCHERNUMBER>
      <NARRATION>Big "deal", urgent</NARRATION>
      <PARTYLEDGERNAME>Foo, Bar &amp; Co.</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Cash</LEDGERNAME>
        <AMOUNT>-100</AMOUNT>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Sales</LEDGERNAME>
        <AMOUNT>100</AMOUNT>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>`;
    const client = stubClient(wrap(v));
    const out = await exportVouchers(client, {
      company: "Acme",
      fromDate: "20260403",
      toDate: "20260403",
      outputDir: scratchDir,
    });
    const csv = readFileSync(out.path, "utf8");
    expect(csv).toContain(`"Foo, Bar & Co."`);
    expect(csv).toContain(`"Big ""deal"", urgent"`);
  });
});
