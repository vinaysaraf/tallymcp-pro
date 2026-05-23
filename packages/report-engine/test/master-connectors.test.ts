import { describe, expect, it } from "vitest";
import {
  getCompanyInfo,
  listCompanies,
  listGroups,
  listLedgers,
  listVoucherTypes,
} from "../src/connectors/index.js";
import { TallyReportError } from "../src/errors.js";
import type { TallyClient } from "../src/client.js";

/** Stub TallyClient that returns a queued response (and records the request). */
function stubClient(responses: string | string[]): TallyClient & { calls: string[] } {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string): Promise<string> {
      calls.push(xml);
      const r = queue.shift();
      if (r === undefined) throw new Error("StubClient: no more responses queued");
      return r;
    },
  };
}

const LIST_COMPANIES_XML = `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION NAME="List of Companies">
        <COMPANY NAME="10000 - Acme Trading">
          <NAME>10000 - Acme Trading</NAME>
          <STARTINGFROM>20240401</STARTINGFROM>
        </COMPANY>
        <COMPANY NAME="20000 - Beta Industries">
          <NAME>20000 - Beta Industries</NAME>
          <STARTINGFROM>20250401</STARTINGFROM>
          <GSTIN>27BETAA0001Z</GSTIN>
        </COMPANY>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;

const EMPTY_COMPANIES_XML = `<ENVELOPE><BODY><DATA><COLLECTION NAME="List of Companies"/></DATA></BODY></ENVELOPE>`;

const LINE_ERROR_XML = `<ENVELOPE><BODY><DATA><LINEERROR>Could not find Company</LINEERROR></DATA></BODY></ENVELOPE>`;

const COMPANY_INFO_XML = `<ENVELOPE>
  <BODY>
    <DESC>
      <CMPINFO><COMPANYNAME>10000 - Acme Trading</COMPANYNAME></CMPINFO>
    </DESC>
    <DATA>
      <COMPANY NAME="10000 - Acme Trading">
        <NAME>10000 - Acme Trading</NAME>
        <STARTINGFROM>20240401</STARTINGFROM>
        <BASECURRENCY>INR</BASECURRENCY>
        <GSTIN>27ACMEC0001Z</GSTIN>
      </COMPANY>
    </DATA>
  </BODY>
</ENVELOPE>`;

const LIST_LEDGERS_XML = `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION NAME="List of Ledgers">
        <LEDGER NAME="Cash">
          <NAME>Cash</NAME>
          <PARENT>Cash-in-hand</PARENT>
          <OPENINGBALANCE>10,000.00</OPENINGBALANCE>
          <ISREVENUE>No</ISREVENUE>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        </LEDGER>
        <LEDGER NAME="Acme &amp; Co">
          <NAME>Acme &amp; Co</NAME>
          <PARENT>Sundry Debtors</PARENT>
          <OPENINGBALANCE>1,23,456.78</OPENINGBALANCE>
          <PARTYGSTIN>27ACMEC0001Z</PARTYGSTIN>
          <INCOMETAXNUMBER>ACMEC1234A</INCOMETAXNUMBER>
        </LEDGER>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;

const SINGLE_LEDGER_XML = `<ENVELOPE><BODY><DATA><COLLECTION NAME="List of Ledgers"><LEDGER NAME="Solo"><NAME>Solo</NAME><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>0</OPENINGBALANCE></LEDGER></COLLECTION></DATA></BODY></ENVELOPE>`;

const LIST_GROUPS_XML = `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION NAME="List of Groups">
        <GROUP NAME="Sundry Debtors">
          <NAME>Sundry Debtors</NAME>
          <PARENT>Current Assets</PARENT>
          <ISREVENUE>No</ISREVENUE>
        </GROUP>
        <GROUP NAME="Direct Expenses">
          <NAME>Direct Expenses</NAME>
          <PARENT>Primary</PARENT>
          <ISREVENUE>Yes</ISREVENUE>
          <AFFECTSGROSSPROFIT>Yes</AFFECTSGROSSPROFIT>
        </GROUP>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;

const LIST_VOUCHER_TYPES_XML = `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION NAME="List of Voucher Types">
        <VOUCHERTYPE NAME="Sales">
          <NAME>Sales</NAME>
          <PARENT>Sales</PARENT>
          <NUMBERINGMETHOD>Automatic</NUMBERINGMETHOD>
        </VOUCHERTYPE>
        <VOUCHERTYPE NAME="Journal">
          <NAME>Journal</NAME>
          <PARENT>Journal</PARENT>
          <NUMBERINGMETHOD>Manual</NUMBERINGMETHOD>
        </VOUCHERTYPE>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;

describe("listCompanies", () => {
  it("parses every COMPANY node in the collection", async () => {
    const client = stubClient(LIST_COMPANIES_XML);
    const cos = await listCompanies(client);
    expect(cos).toHaveLength(2);
    expect(cos[0]?.name).toBe("10000 - Acme Trading");
    expect(cos[0]?.startingFrom).toBe("20240401");
    expect(cos[1]?.gstin).toBe("27BETAA0001Z");
  });

  it("returns an empty array when the collection is empty", async () => {
    expect(await listCompanies(stubClient(EMPTY_COMPANIES_XML))).toEqual([]);
  });

  it("throws TallyReportError when the response carries LINEERROR", async () => {
    await expect(listCompanies(stubClient(LINE_ERROR_XML))).rejects.toBeInstanceOf(
      TallyReportError,
    );
  });

  it("sends the canonical List of Companies envelope", async () => {
    const client = stubClient(EMPTY_COMPANIES_XML);
    await listCompanies(client);
    expect(client.calls[0]).toContain("<ID>List of Companies</ID>");
    expect(client.calls[0]).toContain("<ENCODINGTYPE>UTF8</ENCODINGTYPE>");
  });
});

describe("getCompanyInfo", () => {
  it("returns the loaded company with metadata", async () => {
    const co = await getCompanyInfo(stubClient(COMPANY_INFO_XML), { company: "10000 - Acme Trading" });
    expect(co.name).toBe("10000 - Acme Trading");
    expect(co.startingFrom).toBe("20240401");
    expect(co.gstin).toBe("27ACMEC0001Z");
    expect(co.baseCurrency).toBe("INR");
  });

  it("throws TallyReportError on LINEERROR", async () => {
    await expect(
      getCompanyInfo(stubClient(LINE_ERROR_XML), { company: "Missing" }),
    ).rejects.toBeInstanceOf(TallyReportError);
  });

  it("sends Company Info envelope with SVCURRENTCOMPANY set", async () => {
    const client = stubClient(COMPANY_INFO_XML);
    await getCompanyInfo(client, { company: "10000 - Acme Trading" });
    expect(client.calls[0]).toContain("<ID>Company Info</ID>");
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>10000 - Acme Trading</SVCURRENTCOMPANY>");
  });
});

describe("listLedgers", () => {
  it("parses every LEDGER with masters fields and lakh amounts", async () => {
    const ledgers = await listLedgers(stubClient(LIST_LEDGERS_XML), { company: "Acme" });
    expect(ledgers).toHaveLength(2);
    expect(ledgers[0]?.name).toBe("Cash");
    expect(ledgers[0]?.openingBalance).toBe(10000);
    expect(ledgers[0]?.isDeemedPositive).toBe(true);
    expect(ledgers[1]?.name).toBe("Acme & Co");
    expect(ledgers[1]?.openingBalance).toBe(123456.78);
    expect(ledgers[1]?.gstin).toBe("27ACMEC0001Z");
    expect(ledgers[1]?.panNumber).toBe("ACMEC1234A");
  });

  it("handles a single-ledger response (fast-xml-parser non-array)", async () => {
    const ledgers = await listLedgers(stubClient(SINGLE_LEDGER_XML), { company: "Acme" });
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.name).toBe("Solo");
  });

  it("sends List of Ledgers envelope for the given company", async () => {
    const client = stubClient(SINGLE_LEDGER_XML);
    await listLedgers(client, { company: "Acme" });
    expect(client.calls[0]).toContain("<ID>List of Ledgers</ID>");
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>");
  });
});

describe("listGroups", () => {
  it("parses every GROUP", async () => {
    const groups = await listGroups(stubClient(LIST_GROUPS_XML), { company: "Acme" });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe("Sundry Debtors");
    expect(groups[0]?.parent).toBe("Current Assets");
    expect(groups[1]?.isRevenue).toBe(true);
    expect(groups[1]?.affectsGrossProfit).toBe(true);
  });
});

describe("listVoucherTypes", () => {
  it("parses every VOUCHERTYPE with numbering method", async () => {
    const vts = await listVoucherTypes(stubClient(LIST_VOUCHER_TYPES_XML), { company: "Acme" });
    expect(vts).toHaveLength(2);
    expect(vts[0]?.name).toBe("Sales");
    expect(vts[0]?.numberingMethod).toBe("Automatic");
    expect(vts[1]?.numberingMethod).toBe("Manual");
  });
});
