import { describe, expect, it } from "vitest";
import { getDayBook } from "../src/connectors/index.js";
import type { TallyClient } from "../src/client.js";

function stubClient(responses: string | string[]): TallyClient & { calls: string[] } {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      // Repeat the last response for every chunk request.
      return queue.length > 1 ? (queue.shift() as string) : (queue[0] as string);
    },
  };
}

// Raw Day Book response — full <VOUCHER> objects with one
// <ALLLEDGERENTRIES.LIST> per ledger posting (the per-line detail). This is the
// shape Tally returns for a Voucher collection (the TDL projection that only
// exposed one ledger per voucher was replaced in v1.0.8).
const DAYBOOK_XML = `<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER>
    <DATE>20260403</DATE>
    <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
    <VOUCHERNUMBER>P-1</VOUCHERNUMBER>
    <PARTYLEDGERNAME>HDFC Bank</PARTYLEDGERNAME>
    <NARRATION>Rent paid</NARRATION>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Rent</LEDGERNAME><AMOUNT>-30000</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>HDFC Bank</LEDGERNAME><AMOUNT>30000</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
  <VOUCHER>
    <DATE>20260405</DATE>
    <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
    <VOUCHERNUMBER>S-1</VOUCHERNUMBER>
    <PARTYLEDGERNAME>Acme &amp; Co</PARTYLEDGERNAME>
    <NARRATION>Invoice</NARRATION>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Acme &amp; Co</LEDGERNAME><AMOUNT>118000</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`;

const LINE_ERROR_XML = `<ENVELOPE><BODY><DATA><LINEERROR>Could not find Company</LINEERROR></DATA></BODY></ENVELOPE>`;

describe("getDayBook (raw per-line)", () => {
  it("parses each voucher with its full ledger-entry breakdown", async () => {
    const vs = await getDayBook(stubClient(DAYBOOK_XML), {
      company: "Acme",
      fromDate: "20260403",
      toDate: "20260403",
    });
    expect(vs).toHaveLength(2);
    const [payment, sale] = vs;
    expect(payment?.date).toBe("20260403");
    expect(payment?.voucherType).toBe("Payment");
    expect(payment?.voucherNumber).toBe("P-1");
    expect(payment?.party).toBe("HDFC Bank");
    expect(payment?.narration).toBe("Rent paid");
    // Both ledger postings are preserved (real ledger names + signed amounts).
    expect(payment?.entries).toHaveLength(2);
    expect(payment?.entries[0]).toMatchObject({ ledger: "Rent", amount: -30000, isDeemedPositive: true });
    expect(payment?.entries[1]).toMatchObject({ ledger: "HDFC Bank", amount: 30000, isDeemedPositive: false });
    expect(sale?.party).toBe("Acme & Co");
    expect(sale?.entries[0]?.ledger).toBe("Acme & Co");
  });

  it("requests a Day Book Voucher collection for the period", async () => {
    const client = stubClient(DAYBOOK_XML);
    await getDayBook(client, { company: "Acme", fromDate: "20260403", toDate: "20260403" });
    expect(client.calls[0]).toContain("Day Book");
    expect(client.calls[0]).toContain("<TYPE>Voucher</TYPE>");
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>");
  });

  it("chunks long periods into multiple requests (default 7-day window)", async () => {
    const client = stubClient(DAYBOOK_XML);
    await getDayBook(client, { company: "Acme", fromDate: "20260401", toDate: "20260430" });
    // 30 days / 7 = 5 windows → 5 requests.
    expect(client.calls).toHaveLength(5);
  });

  it("throws TallyReportError when the response carries a LINEERROR", async () => {
    await expect(
      getDayBook(stubClient(LINE_ERROR_XML), {
        company: "Acme",
        fromDate: "20260403",
        toDate: "20260403",
      }),
    ).rejects.toThrow();
  });
});
