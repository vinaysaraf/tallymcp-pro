import { describe, expect, it } from "vitest";
import { runReport } from "../src/run-report.js";
import { TallyReportError } from "../src/errors.js";
import type { TallyClient } from "../src/client.js";

function stubClient(response: string): TallyClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      return response;
    },
  };
}

const LIST_COMPANIES_XML = `<ENVELOPE><BODY><DATA>
  <COLLECTION NAME="List of Companies">
    <COMPANY NAME="Acme"><NAME>Acme</NAME><STARTINGFROM>20260401</STARTINGFROM></COMPANY>
  </COLLECTION>
</DATA></BODY></ENVELOPE>`;

const LIST_LEDGERS_XML = `<ENVELOPE><BODY><DATA>
  <COLLECTION NAME="List of Ledgers">
    <LEDGER NAME="Cash"><NAME>Cash</NAME><PARENT>Cash-in-hand</PARENT><OPENINGBALANCE>0</OPENINGBALANCE></LEDGER>
  </COLLECTION>
</DATA></BODY></ENVELOPE>`;

const TB_XML = `<ENVELOPE><BODY><DATA>
  <TBROW><GROUPNAME>Sundry Debtors</GROUPNAME><DEBIT>1,00,000</DEBIT><CREDIT>0</CREDIT></TBROW>
</DATA></BODY></ENVELOPE>`;

describe("runReport — dispatcher", () => {
  it("dispatches ListOfCompanies and returns ok status with rows", async () => {
    const client = stubClient(LIST_COMPANIES_XML);
    const res = await runReport(client, { reportId: "ListOfCompanies" });
    expect(res.status).toBe("ok");
    expect(res.rows).toHaveLength(1);
    expect(res.meta.reportId).toBe("ListOfCompanies");
    expect(typeof res.meta.generatedAt).toBe("string");
  });

  it("dispatches LedgerMasters and includes company in meta", async () => {
    const client = stubClient(LIST_LEDGERS_XML);
    const res = await runReport(client, { reportId: "LedgerMasters", company: "Acme" });
    expect(res.rows).toHaveLength(1);
    expect(res.meta.company).toBe("Acme");
    expect(res.meta.period).toBeUndefined();
  });

  it("rejects period-dependent reports with no company supplied", async () => {
    const client = stubClient(TB_XML);
    await expect(
      runReport(client, { reportId: "TrialBalance" }),
    ).rejects.toBeInstanceOf(TallyReportError);
  });

  it("uses resolvePeriod when dates are omitted (Indian FY anchor)", async () => {
    const client = stubClient(TB_XML);
    const res = await runReport(
      client,
      { reportId: "TrialBalance", company: "Acme" },
      { company: { startingFrom: "20240401" }, asOf: new Date(2026, 4, 23) },
    );
    expect(res.meta.period).toEqual({ from: "20260401", to: "20270331" });
    // TB went through TDL in v0.7.0 — dates are emitted in Tally display format (d-MMM-yyyy).
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2027</SVTODATE>");
  });

  it("uses explicit fromDate/toDate when supplied", async () => {
    const client = stubClient(TB_XML);
    const res = await runReport(client, {
      reportId: "TrialBalance",
      company: "Acme",
      fromDate: "20250401",
      toDate: "20260331",
    });
    expect(res.meta.period).toEqual({ from: "20250401", to: "20260331" });
  });

  it("rejects an invalid reportId via Zod", async () => {
    const client = stubClient("");
    await expect(
      runReport(client, { reportId: "ReceiptRegister" as never }),
    ).rejects.toThrow();
  });
});
