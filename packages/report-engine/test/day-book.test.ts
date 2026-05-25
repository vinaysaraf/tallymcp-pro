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
      const r = queue.shift();
      if (r === undefined) throw new Error("StubClient: no more responses queued");
      return r;
    },
  };
}

// TDL-shaped Day Book response — one row per voucher, F01..F07 projection.
const DAYBOOK_XML = `<ENVELOPE><BODY><DATA>
  <ROW>
    <F01>2026-04-03</F01>
    <F02>Sales</F02>
    <F03>S-1</F03>
    <F04>Acme &amp; Co</F04>
    <F05>INV-S-1</F05>
    <F06>Sale</F06>
    <F07>-118000</F07>
  </ROW>
  <ROW>
    <F01>2026-04-05</F01>
    <F02>Receipt</F02>
    <F03>R-1</F03>
    <F04>Acme &amp; Co</F04>
    <F05></F05>
    <F06>Payment received</F06>
    <F07>118000</F07>
  </ROW>
</DATA></BODY></ENVELOPE>`;

const EXCEPTION_XML = `<EXCEPTION>Period out of range</EXCEPTION>`;

describe("getDayBook (TDL-backed)", () => {
  it("makes one POST for the period by default (no chunking)", async () => {
    const client = stubClient(DAYBOOK_XML);
    const vouchers = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
    });
    expect(client.calls).toHaveLength(1);
    expect(vouchers).toHaveLength(2);
  });

  it("parses voucher metadata: date, type, number, party, narration", async () => {
    const client = stubClient(DAYBOOK_XML);
    const [first] = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
    });
    expect(first?.date).toBe("20260403");
    expect(first?.voucherType).toBe("Sales");
    expect(first?.voucherNumber).toBe("S-1");
    expect(first?.party).toBe("Acme & Co");
    expect(first?.reference).toBe("INV-S-1");
    expect(first?.narration).toBe("Sale");
  });

  it("stores the voucher amount as the single entry with sign-derived isDeemedPositive", async () => {
    const client = stubClient(DAYBOOK_XML);
    const [neg, pos] = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
    });
    expect(neg?.entries[0]?.amount).toBe(-118000);
    expect(neg?.entries[0]?.isDeemedPositive).toBe(false);
    expect(pos?.entries[0]?.amount).toBe(118000);
    expect(pos?.entries[0]?.isDeemedPositive).toBe(true);
  });

  it("sends an inline-TDL Voucher collection envelope with the period", async () => {
    const client = stubClient(DAYBOOK_XML);
    await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
    });
    expect(client.calls[0]).toContain("<TYPE>Voucher</TYPE>");
    expect(client.calls[0]).toContain("<BELONGSTO>Yes</BELONGSTO>");
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>30-Apr-2026</SVTODATE>");
  });

  it("makes N POSTs when chunkDays > 0 (opt-in chunking)", async () => {
    const client = stubClient([DAYBOOK_XML, DAYBOOK_XML]);
    await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260408",
      chunkDays: 7,
    });
    expect(client.calls).toHaveLength(2);
  });

  it("throws on Tally <EXCEPTION> response", async () => {
    await expect(
      getDayBook(stubClient(EXCEPTION_XML), {
        company: "Acme",
        fromDate: "20260401",
        toDate: "20260401",
      }),
    ).rejects.toThrow(/Tally returned <EXCEPTION>/);
  });
});
