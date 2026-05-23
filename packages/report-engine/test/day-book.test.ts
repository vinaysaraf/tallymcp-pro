import { describe, expect, it } from "vitest";
import { getDayBook } from "../src/connectors/index.js";
import { TallyReportError } from "../src/errors.js";
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

function voucherXml(opts: {
  date: string;
  voucherNumber: string;
  party?: string;
}): string {
  return `<VOUCHER VCHTYPE="Sales">
    <DATE>${opts.date}</DATE>
    <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${opts.voucherNumber}</VOUCHERNUMBER>
    <NARRATION>Sale</NARRATION>
    <PARTYLEDGERNAME>${opts.party ?? "Acme &amp; Co"}</PARTYLEDGERNAME>
    <REFERENCE>INV-${opts.voucherNumber}</REFERENCE>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Acme &amp; Co</LEDGERNAME>
      <AMOUNT>-1,18,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Sales</LEDGERNAME>
      <AMOUNT>1,00,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>CGST</LEDGERNAME>
      <AMOUNT>9,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>SGST</LEDGERNAME>
      <AMOUNT>9,000.00</AMOUNT>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>`;
}

const wrap = (inner: string) => `<ENVELOPE><BODY><DATA>${inner}</DATA></BODY></ENVELOPE>`;
const LINE_ERROR_XML = wrap("<LINEERROR>Period out of range</LINEERROR>");

describe("getDayBook — single chunk", () => {
  it("makes one POST for a ≤7-day range", async () => {
    const client = stubClient(wrap(voucherXml({ date: "20260403", voucherNumber: "S-1" })));
    const vouchers = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260407",
    });
    expect(client.calls).toHaveLength(1);
    expect(vouchers).toHaveLength(1);
  });

  it("parses voucher metadata (party, narration, reference, voucherNumber)", async () => {
    const client = stubClient(wrap(voucherXml({ date: "20260403", voucherNumber: "S-1" })));
    const [v] = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260403",
      toDate: "20260403",
    });
    expect(v?.voucherNumber).toBe("S-1");
    expect(v?.party).toBe("Acme & Co");
    expect(v?.reference).toBe("INV-S-1");
    expect(v?.voucherType).toBe("Sales");
    expect(v?.narration).toBe("Sale");
  });

  it("parses entries with debit-negative + ISDEEMEDPOSITIVE convention", async () => {
    const client = stubClient(wrap(voucherXml({ date: "20260403", voucherNumber: "S-1" })));
    const [v] = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260403",
      toDate: "20260403",
    });
    expect(v?.entries).toHaveLength(4);
    expect(v?.entries[0]).toEqual({
      ledger: "Acme & Co",
      amount: -118000,
      isDeemedPositive: true,
    });
    expect(v?.entries[1]?.amount).toBe(100000);
    expect(v?.entries[2]?.isDeemedPositive).toBe(false);
  });
});

describe("getDayBook — chunked windows", () => {
  it("makes 2 POSTs for an 8-day range (default 7-day chunk)", async () => {
    const client = stubClient([
      wrap(voucherXml({ date: "20260402", voucherNumber: "A" })),
      wrap(voucherXml({ date: "20260408", voucherNumber: "B" })),
    ]);
    const vouchers = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260408",
    });
    expect(client.calls).toHaveLength(2);
    expect(vouchers.map((v) => v.voucherNumber)).toEqual(["A", "B"]);
  });

  it("emits non-overlapping date windows that cover the full range", async () => {
    const responses = Array.from({ length: 5 }, (_, i) =>
      wrap(voucherXml({ date: "20260415", voucherNumber: `v${i}` })),
    );
    const client = stubClient(responses);
    await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
    });
    expect(client.calls).toHaveLength(5); // 30 days / 7 = 5 chunks
    expect(client.calls[0]).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>20260407</SVTODATE>");
    expect(client.calls[1]).toContain("<SVFROMDATE>20260408</SVFROMDATE>");
    expect(client.calls[4]).toContain("<SVFROMDATE>20260429</SVFROMDATE>");
    expect(client.calls[4]).toContain("<SVTODATE>20260430</SVTODATE>");
  });

  it("respects a custom chunkDays setting", async () => {
    const client = stubClient([wrap(""), wrap("")]);
    await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260430",
      chunkDays: 30,
    });
    expect(client.calls).toHaveLength(1);
  });
});

describe("getDayBook — errors", () => {
  it("throws TallyReportError when LINEERROR appears in any chunk", async () => {
    const client = stubClient([
      wrap(voucherXml({ date: "20260402", voucherNumber: "A" })),
      LINE_ERROR_XML,
    ]);
    await expect(
      getDayBook(client, { company: "Acme", fromDate: "20260401", toDate: "20260408" }),
    ).rejects.toBeInstanceOf(TallyReportError);
  });

  it("returns an empty list when the range has no vouchers", async () => {
    const client = stubClient(wrap(""));
    const vouchers = await getDayBook(client, {
      company: "Acme",
      fromDate: "20260401",
      toDate: "20260401",
    });
    expect(vouchers).toEqual([]);
  });
});
