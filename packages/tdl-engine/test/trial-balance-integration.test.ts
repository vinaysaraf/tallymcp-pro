import { describe, expect, it } from "vitest";
import { getReport, loadTemplate, runTdlReport } from "../src/index.js";

const FAKE_SILVER_RESPONSE = `<ENVELOPE><BODY><DATA>
  <ROW>
    <F01>Cash</F01>
    <F02>Cash-in-hand</F02>
    <F03>10000</F03>
    <F04>50000</F04>
    <F05>20000</F05>
    <F06>40000</F06>
  </ROW>
  <ROW>
    <F01>Acme &amp; Co</F01>
    <F02>Sundry Debtors</F02>
    <F03>0</F03>
    <F04>118000</F04>
    <F05>0</F05>
    <F06>118000</F06>
  </ROW>
  <ROW>
    <F01>Sales</F01>
    <F02>Sales Accounts</F02>
    <F03>0</F03>
    <F04>0</F04>
    <F05>100000</F05>
    <F06>-100000</F06>
  </ROW>
</DATA></BODY></ENVELOPE>`;

function stubClient(response: string): { post: (xml: string) => Promise<string>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    post: async (xml: string) => {
      calls.push(xml);
      return response;
    },
  };
}

interface TdlTbRow {
  ledger: string;
  parent: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

describe("trial-balance through tdl-engine (integration)", () => {
  it("loads catalog + template, runs report, returns 3 typed rows", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);

    const rows = await runTdlReport<TdlTbRow>(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "OM JAI JAGDISH",
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      ledger: "Cash",
      parent: "Cash-in-hand",
      opening: 10000,
      debit: 50000,
      credit: 20000,
      closing: 40000,
    });
    expect(rows[1]?.ledger).toBe("Acme & Co");
    expect(rows[2]?.parent).toBe("Sales Accounts");
  });

  it("renders Tally-format dates into the request envelope", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "Acme",
    });
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2022</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2023</SVTODATE>");
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>");
  });

  it("escapes special characters in the company name", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: 'A & B "X" <Y>',
    });
    expect(client.calls[0]).toContain(
      "<SVCURRENTCOMPANY>A &amp; B &quot;X&quot; &lt;Y&gt;</SVCURRENTCOMPANY>",
    );
  });

  it("envelope contains the inline TDL REPORT/FORM/PART/LINE/FIELD/COLLECTION skeleton", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    const request = client.calls[0]!;
    expect(request).toContain('<REPORT NAME="TallyMcpTdlReport">');
    expect(request).toContain('<COLLECTION NAME="TallyMcpCollection">');
    expect(request).toContain("<TYPE>Ledger</TYPE>");
    expect(request).toContain("<XMLTAG>ROW</XMLTAG>");
  });
});
