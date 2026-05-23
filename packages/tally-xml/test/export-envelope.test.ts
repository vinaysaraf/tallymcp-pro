import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  balanceSheetEnvelope,
  buildExportEnvelope,
  companyInfoEnvelope,
  dayBookEnvelope,
  listCompaniesEnvelope,
  listGroupsEnvelope,
  listLedgersEnvelope,
  listVoucherTypesEnvelope,
  profitAndLossEnvelope,
  salesRegisterEnvelope,
  trialBalanceEnvelope,
} from "../src/export-envelope.js";

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../samples");
const readSample = (name: string): string => readFileSync(join(samplesDir, name), "utf8");

const PERIOD = { company: "Acme", fromDate: "20250401", toDate: "20260331" };

describe("buildExportEnvelope", () => {
  it("emits the canonical Export Data header with the given report id", () => {
    const xml = buildExportEnvelope({ reportId: "List of Companies" });
    expect(xml).toContain("<TALLYREQUEST>Export Data</TALLYREQUEST>");
    expect(xml).toContain("<TYPE>Data</TYPE>");
    expect(xml).toContain("<ID>List of Companies</ID>");
  });

  it("always appends UTF-8 export-format static variables", () => {
    const xml = buildExportEnvelope({ reportId: "Trial Balance" });
    expect(xml).toContain("<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>");
    expect(xml).toContain("<ENCODINGTYPE>UTF8</ENCODINGTYPE>");
  });

  it("omits company and date static variables when not supplied", () => {
    const xml = buildExportEnvelope({ reportId: "List of Companies" });
    expect(xml).not.toContain("SVCURRENTCOMPANY");
    expect(xml).not.toContain("SVFROMDATE");
    expect(xml).not.toContain("SVTODATE");
  });

  it("orders static variables: company, dates, report vars, then format/encoding", () => {
    const xml = buildExportEnvelope({
      reportId: "Day Book",
      company: "Acme",
      fromDate: "20250401",
      toDate: "20260331",
      staticVariables: { DSPSHOWNARRATIONS: "Yes" },
    });
    const positions = [
      "SVCURRENTCOMPANY",
      "SVFROMDATE",
      "SVTODATE",
      "DSPSHOWNARRATIONS",
      "SVEXPORTFORMAT",
      "ENCODINGTYPE",
    ].map((tag) => xml.indexOf(`<${tag}>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("escapes &, \" and < in the company name", () => {
    const raw = 'A & B "Traders" <X>';
    const xml = buildExportEnvelope({ reportId: "Day Book", company: raw });
    expect(xml).toContain(
      "<SVCURRENTCOMPANY>A &amp; B &quot;Traders&quot; &lt;X&gt;</SVCURRENTCOMPANY>",
    );
    expect(xml).not.toContain(raw);
  });

  it("escapes & in the report id", () => {
    const xml = buildExportEnvelope({ reportId: "Profit & Loss A/c" });
    expect(xml).toContain("<ID>Profit &amp; Loss A/c</ID>");
  });
});

describe("per-report envelope helpers", () => {
  it("listCompaniesEnvelope matches samples/list-companies.request.xml", () => {
    expect(listCompaniesEnvelope().trim()).toBe(readSample("list-companies.request.xml").trim());
  });

  it("companyInfoEnvelope matches samples/company-info.request.xml", () => {
    expect(companyInfoEnvelope({ company: "10000 - Acme Trading" }).trim()).toBe(
      readSample("company-info.request.xml").trim(),
    );
  });

  it("dayBookEnvelope matches samples/day-book.request.xml", () => {
    expect(
      dayBookEnvelope({ company: "10000 - Acme Trading", fromDate: "20250401", toDate: "20260331" }).trim(),
    ).toBe(readSample("day-book.request.xml").trim());
  });

  it("listLedgersEnvelope targets List of Ledgers for the company", () => {
    const xml = listLedgersEnvelope({ company: "Acme" });
    expect(xml).toContain("<ID>List of Ledgers</ID>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>");
  });

  it("listGroupsEnvelope targets List of Groups for the company", () => {
    expect(listGroupsEnvelope({ company: "Acme" })).toContain("<ID>List of Groups</ID>");
  });

  it("listVoucherTypesEnvelope targets List of Voucher Types for the company", () => {
    expect(listVoucherTypesEnvelope({ company: "Acme" })).toContain(
      "<ID>List of Voucher Types</ID>",
    );
  });

  it("dayBookEnvelope targets a Voucher collection for the period (Narration in FETCH)", () => {
    const xml = dayBookEnvelope(PERIOD);
    expect(xml).toContain("<ID>Day Book</ID>");
    expect(xml).toContain("<TYPE>Voucher</TYPE>");
    expect(xml).toMatch(/Narration/);
    expect(xml).toContain("<SVFROMDATE>20250401</SVFROMDATE>");
    expect(xml).toContain("<SVTODATE>20260331</SVTODATE>");
  });

  it("trialBalanceEnvelope targets Trial Balance with grand total and period", () => {
    const xml = trialBalanceEnvelope(PERIOD);
    expect(xml).toContain("<ID>Trial Balance</ID>");
    expect(xml).toContain("<DSPSHOWGRANDTOTAL>Yes</DSPSHOWGRANDTOTAL>");
    expect(xml).toContain("<SVFROMDATE>20250401</SVFROMDATE>");
  });

  it("profitAndLossEnvelope targets Profit & Loss A/c (escaped) with period", () => {
    const xml = profitAndLossEnvelope(PERIOD);
    expect(xml).toContain("<ID>Profit &amp; Loss A/c</ID>");
    expect(xml).toContain("<SVTODATE>20260331</SVTODATE>");
  });

  it("balanceSheetEnvelope targets Balance Sheet with period", () => {
    const xml = balanceSheetEnvelope(PERIOD);
    expect(xml).toContain("<ID>Balance Sheet</ID>");
    expect(xml).toContain("<SVTODATE>20260331</SVTODATE>");
  });

  it("salesRegisterEnvelope targets Sales Register with period", () => {
    const xml = salesRegisterEnvelope(PERIOD);
    expect(xml).toContain("<ID>Sales Register</ID>");
    expect(xml).toContain("<SVFROMDATE>20250401</SVFROMDATE>");
  });
});
