import { describe, expect, it } from "vitest";
import { getDayBookStream } from "../src/connectors/index.js";
import type { TallyClient } from "../src/client.js";

const dashed = (yyyymmdd: string): string =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/**
 * Stub mimicking Tally's real behaviour: the loaded-period probe
 * (`TallyMcpCurrentPeriod`) returns `loaded` (or an empty body when null), and
 * every Voucher-collection chunk returns the SAME `vouchersXml` (Tally ignores
 * SVFROMDATE/SVTODATE and serves the loaded period for each chunk).
 */
function tallyStub(
  loaded: { from: string; to: string } | null,
  vouchersXml: string,
): TallyClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      if (xml.includes("TallyMcpCurrentPeriod")) {
        return loaded
          ? `<ENVELOPE><BODY><DATA><ROW><PFROM>${dashed(loaded.from)}</PFROM><PTO>${dashed(loaded.to)}</PTO></ROW></DATA></BODY></ENVELOPE>`
          : `<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>`;
      }
      return vouchersXml;
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
    // Loaded period fully covers the request → gate passes; then filter + dedup.
    const client = tallyStub({ from: "20260401", to: "20261231" }, VOUCHERS_XML);
    const vouchers = await collect("Acme", "20260401", "20260414", client);
    expect(client.calls.length).toBeGreaterThan(1); // probe + ≥1 chunk
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
    const vouchers = await collect("Acme", "20260401", "20260407", tallyStub({ from: "20260401", to: "20260430" }, XML));
    expect(vouchers).toHaveLength(2);
  });

  it("keeps same date/type/number/entries vouchers that differ only in reference", async () => {
    const XML = `<ENVELOPE><BODY><DATA><COLLECTION>
      <VOUCHER><DATE>20260405</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><REFERENCE>INV-A</REFERENCE>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>A</LEDGERNAME><AMOUNT>100</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
      <VOUCHER><DATE>20260405</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><REFERENCE>INV-B</REFERENCE>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>A</LEDGERNAME><AMOUNT>100</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>
    </COLLECTION></DATA></BODY></ENVELOPE>`;
    const vouchers = await collect("Acme", "20260401", "20260407", tallyStub({ from: "20260401", to: "20260430" }, XML));
    // Identical except Reference → fingerprint includes reference → both kept.
    expect(vouchers).toHaveLength(2);
  });

  it("fails loudly when the requested range extends BEYOND Tally's loaded period", async () => {
    // Loaded period is a narrow window; requested month is wider. Completing
    // would silently return only the loaded sub-set (Codex's wider-request case).
    await expect(
      collect("Acme", "20260401", "20260430", tallyStub({ from: "20260415", to: "20260425" }, VOUCHERS_XML)),
    ).rejects.toThrow(/currently-loaded period/);
  });

  it("fails CLOSED when the loaded period cannot be determined (null probe)", async () => {
    // Probe returns no period → coverage can't be proven → refuse rather than
    // risk a silent partial set.
    await expect(
      collect("Acme", "20200401", "20200414", tallyStub(null, VOUCHERS_XML)),
    ).rejects.toThrow(/Could not confirm TallyPrime's currently-loaded period/);
  });

  it("fails CLOSED on a null probe even when the served data overlaps the request", async () => {
    // Null probe + a voucher (20260405) that DOES fall in the requested range
    // 20260401-20260430. Without fail-closed this would have completed with the
    // overlapping sub-set; it must instead refuse (the partial-overlap case).
    await expect(
      collect("Acme", "20260401", "20260430", tallyStub(null, VOUCHERS_XML)),
    ).rejects.toThrow(/Could not confirm TallyPrime's currently-loaded period/);
  });
});
