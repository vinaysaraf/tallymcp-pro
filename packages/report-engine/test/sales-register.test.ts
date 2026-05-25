import { describe, expect, it } from "vitest";
import { getSalesRegister } from "../src/connectors/index.js";
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

// TDL-shaped Sales Register response — filtered server-side by $$IsSales.
const SALES_XML = `<ENVELOPE><BODY><DATA>
  <ROW>
    <F01>2026-04-05</F01>
    <F02>Sales</F02>
    <F03>S-100</F03>
    <F04>Acme &amp; Co</F04>
    <F05>INV-100</F05>
    <F06>Sale to Acme</F06>
    <F07>-118000</F07>
  </ROW>
</DATA></BODY></ENVELOPE>`;

const EXCEPTION_XML = `<EXCEPTION>Period out of range</EXCEPTION>`;

const PERIOD = { company: "Acme", fromDate: "20260401", toDate: "20270331" } as const;

describe("getSalesRegister (TDL-backed)", () => {
  it("parses sales vouchers from the TDL F01..F07 row shape", async () => {
    const vs = await getSalesRegister(stubClient(SALES_XML), PERIOD);
    expect(vs).toHaveLength(1);
    expect(vs[0]?.date).toBe("20260405");
    expect(vs[0]?.voucherType).toBe("Sales");
    expect(vs[0]?.voucherNumber).toBe("S-100");
    expect(vs[0]?.party).toBe("Acme & Co");
    expect(vs[0]?.reference).toBe("INV-100");
    expect(vs[0]?.narration).toBe("Sale to Acme");
    expect(vs[0]?.entries[0]?.amount).toBe(-118000);
  });

  it("sends an inline-TDL Voucher collection filtered to $$IsSales", async () => {
    const client = stubClient(SALES_XML);
    await getSalesRegister(client, PERIOD);
    expect(client.calls[0]).toContain("<TYPE>Voucher</TYPE>");
    expect(client.calls[0]).toContain("<FILTER>IsSalesVch</FILTER>");
    expect(client.calls[0]).toContain('$$IsSales:$VoucherTypeName');
  });

  it("throws on Tally <EXCEPTION> response", async () => {
    await expect(getSalesRegister(stubClient(EXCEPTION_XML), PERIOD)).rejects.toThrow(
      /Tally returned <EXCEPTION>/,
    );
  });
});
