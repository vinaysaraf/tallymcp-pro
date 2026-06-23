import { describe, expect, it } from "vitest";
import { getDayBookStream } from "../src/connectors/index.js";
import type { TallyClient } from "../src/client.js";

// Tally's bare Voucher collection ignores SVFROMDATE/SVTODATE and serves the
// CURRENT period for every request, so chunked requests repeat the same
// vouchers and may include out-of-range ones. This stub mimics that: it returns
// the SAME response for every chunk request.
function repeatingStub(response: string): TallyClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      return response;
    },
  };
}

const VOUCHERS_XML = `<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER>
    <DATE>20260405</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>P-1</VOUCHERNUMBER>
    <PARTYLEDGERNAME>HDFC Bank</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Rent</LEDGERNAME><AMOUNT>-1000</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST>
  </VOUCHER>
  <VOUCHER>
    <DATE>20250101</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>J-99</VOUCHERNUMBER>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Suspense</LEDGERNAME><AMOUNT>500</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`;

async function collect(company: string, fromDate: string, toDate: string, client: TallyClient) {
  const out = [];
  for await (const chunk of getDayBookStream(client, {
    company,
    fromDate: fromDate as never,
    toDate: toDate as never,
  })) {
    out.push(...chunk);
  }
  return out;
}

describe("getDayBookStream (period-safe)", () => {
  it("filters out vouchers outside the requested period and de-duplicates chunk repeats", async () => {
    const client = repeatingStub(VOUCHERS_XML);
    // 14-day range → 2 chunks → the stub returns both vouchers twice (4 total).
    const vouchers = await collect("Acme", "20260401", "20260414", client);
    expect(client.calls.length).toBeGreaterThan(1); // chunked into multiple requests
    // Only P-1 (20260405) is in range; J-99 (20250101) is filtered; the chunk
    // repeat of P-1 is de-duplicated → exactly one voucher.
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0]?.voucherNumber).toBe("P-1");
    expect(vouchers[0]?.entries[0]?.ledger).toBe("Rent");
  });

  it("keeps genuine same-number vouchers that differ in date/entries", async () => {
    const XML = `<ENVELOPE><BODY><DATA><COLLECTION>
      <VOUCHER><DATE>20260405</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>A</LEDGERNAME><AMOUNT>100</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
      <VOUCHER><DATE>20260406</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>B</LEDGERNAME><AMOUNT>200</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
    </COLLECTION></DATA></BODY></ENVELOPE>`;
    const vouchers = await collect("Acme", "20260401", "20260407", repeatingStub(XML));
    // Two vouchers share number "1" but differ in date/entries → both kept
    // (so the audit's duplicate-number check still sees them).
    expect(vouchers).toHaveLength(2);
  });

  it("keeps same date/type/number/entries vouchers that differ only in reference/narration", async () => {
    const XML = `<ENVELOPE><BODY><DATA><COLLECTION>
      <VOUCHER><DATE>20260405</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><REFERENCE>INV-A</REFERENCE>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>A</LEDGERNAME><AMOUNT>100</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
      <VOUCHER><DATE>20260405</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><REFERENCE>INV-B</REFERENCE>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>A</LEDGERNAME><AMOUNT>100</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
    </COLLECTION></DATA></BODY></ENVELOPE>`;
    const vouchers = await collect("Acme", "20260401", "20260407", repeatingStub(XML));
    // Identical except Reference → the fingerprint includes reference, so both
    // are retained rather than collapsed.
    expect(vouchers).toHaveLength(2);
  });

  it("fails loudly when Tally serves only its current period and it is out of range", async () => {
    // Requested a historical FY, but Tally (ignoring SVFROMDATE/SVTODATE on a
    // bare Voucher collection) returns only current-period vouchers — none in
    // range. Must throw, not silently return empty/partial data.
    await expect(
      collect("Acme", "20200401", "20200414", repeatingStub(VOUCHERS_XML)),
    ).rejects.toThrow(/currently-loaded period/);
  });
});
