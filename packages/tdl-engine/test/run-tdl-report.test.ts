import { describe, expect, it } from "vitest";
import { runTdlReport } from "../src/run-tdl-report.js";
import { TdlEngineError, TdlExceptionError } from "../src/errors.js";
import type { CatalogReport } from "../src/catalog.js";

const FAKE_REPORT: CatalogReport = {
  name: "fake-tb",
  template: "fake.xml",
  input: [
    { name: "fromDate", datatype: "date", required: true },
    { name: "toDate", datatype: "date", required: true },
    { name: "targetCompany", datatype: "string", required: false },
  ],
  output: {
    datatype: "array",
    fields: [
      { identifier: "F01", name: "ledger", datatype: "string" },
      { identifier: "F02", name: "parent", datatype: "string" },
      { identifier: "F03", name: "opening", datatype: "number" },
    ],
  },
};

const FAKE_TEMPLATE = `<ENVELOPE>
  <HEADER><ID>FAKE</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVFROMDATE>{fromDate}</SVFROMDATE>
    <SVTODATE>{toDate}</SVTODATE>
    <nunjuck>if targetCompany</nunjuck>
    <SVCURRENTCOMPANY>{{targetCompany | escape}}</SVCURRENTCOMPANY>
    <nunjuck>endif</nunjuck>
  </STATICVARIABLES></DESC></BODY>
</ENVELOPE>`;

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

const ROWS_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Cash</F01><F02>Cash-in-hand</F02><F03>1000</F03></ROW>
  <ROW><F01>Acme &amp; Co</F01><F02>Sundry Debtors</F02><F03>50000</F03></ROW>
</DATA></BODY></ENVELOPE>`;

const EMPTY_XML = `<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>`;
const EXCEPTION_XML = `<EXCEPTION>Period out of range</EXCEPTION>`;

describe("runTdlReport", () => {
  it("renders template, posts, parses rows end-to-end", async () => {
    const client = stubClient(ROWS_XML);
    const rows = await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "Acme",
    });
    expect(rows).toEqual([
      { ledger: "Cash", parent: "Cash-in-hand", opening: 1000 },
      { ledger: "Acme & Co", parent: "Sundry Debtors", opening: 50000 },
    ]);
  });

  it("substitutes date params into the request (1-Apr-2022 format)", async () => {
    const client = stubClient(ROWS_XML);
    await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2022</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2023</SVTODATE>");
  });

  it("omits SVCURRENTCOMPANY when targetCompany not supplied", async () => {
    const client = stubClient(ROWS_XML);
    await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(client.calls[0]).not.toContain("SVCURRENTCOMPANY");
  });

  it("returns empty array when Tally sends empty DATA", async () => {
    const client = stubClient(EMPTY_XML);
    const rows = await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(rows).toEqual([]);
  });

  it("throws TdlExceptionError on EXCEPTION response", async () => {
    const client = stubClient(EXCEPTION_XML);
    await expect(
      runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
        fromDate: new Date(2022, 3, 1),
        toDate: new Date(2023, 2, 31),
      }),
    ).rejects.toBeInstanceOf(TdlExceptionError);
  });

  it("rejects when a required input param is missing", async () => {
    const client = stubClient(ROWS_XML);
    await expect(
      // @ts-expect-error — intentionally missing required param
      runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, { fromDate: new Date() }),
    ).rejects.toThrow(/toDate/);
  });
});
