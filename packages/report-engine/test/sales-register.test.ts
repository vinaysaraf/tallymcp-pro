import { describe, expect, it } from "vitest";
import { getSalesRegister } from "../src/connectors/index.js";
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

const SALES_XML = `<ENVELOPE><BODY><DATA>
  <VOUCHER VCHTYPE="Sales">
    <DATE>20260405</DATE>
    <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
    <VOUCHERNUMBER>S-100</VOUCHERNUMBER>
    <NARRATION>Sale to Acme</NARRATION>
    <PARTYLEDGERNAME>Acme &amp; Co</PARTYLEDGERNAME>
    <REFERENCE>INV-100</REFERENCE>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Acme &amp; Co</LEDGERNAME>
      <AMOUNT>-1,18,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Sales</LEDGERNAME>
      <AMOUNT>1,18,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
</DATA></BODY></ENVELOPE>`;

const PERIOD = { company: "Acme", fromDate: "20260401", toDate: "20270331" } as const;

describe("getSalesRegister", () => {
  it("parses sales vouchers using the shared Voucher schema", async () => {
    const vs = await getSalesRegister(stubClient(SALES_XML), PERIOD);
    expect(vs).toHaveLength(1);
    expect(vs[0]?.voucherNumber).toBe("S-100");
    expect(vs[0]?.party).toBe("Acme & Co");
    expect(vs[0]?.entries[0]?.amount).toBe(-118000);
  });

  it("sends Sales Register envelope with the period", async () => {
    const client = stubClient(SALES_XML);
    await getSalesRegister(client, PERIOD);
    expect(client.calls[0]).toContain("<ID>Sales Register</ID>");
    expect(client.calls[0]).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
  });

  it("throws TallyReportError on LINEERROR", async () => {
    await expect(
      getSalesRegister(
        stubClient(`<ENVELOPE><BODY><DATA><LINEERROR>oops</LINEERROR></DATA></BODY></ENVELOPE>`),
        PERIOD,
      ),
    ).rejects.toBeInstanceOf(TallyReportError);
  });
});
