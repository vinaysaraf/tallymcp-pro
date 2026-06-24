import { describe, expect, it } from "vitest";
import { getDayBookStream } from "../src/connectors/index.js";
import type { TallyClient } from "../src/client.js";

/**
 * The stream fetches each chunk window through the Day Book report-form TDL, so
 * the stub answers every request with a `<ROW>F01..F08</ROW>` Day Book response
 * (the parser is fail-loud, so each row MUST carry all eight fields). There is
 * no loaded-period probe and no de-duplication any more — the report-form
 * honors SVFROMDATE/SVTODATE and the windows are disjoint.
 */
function dayBookRow(f: {
  date: string; // dashed YYYY-MM-DD, as the TDL formats $Date
  type: string;
  num: string;
  party?: string;
  ref?: string;
  narr?: string;
  amount: string;
  ledger: string;
}): string {
  return (
    `<ROW><F01>${f.date}</F01><F02>${f.type}</F02><F03>${f.num}</F03>` +
    `<F04>${f.party ?? ""}</F04><F05>${f.ref ?? ""}</F05><F06>${f.narr ?? ""}</F06>` +
    `<F07>${f.amount}</F07><F08>${f.ledger}</F08></ROW>`
  );
}

const wrap = (rows: string): string => `<ENVELOPE><BODY><DATA>${rows}</DATA></BODY></ENVELOPE>`;

function stubClient(responses: string[]): TallyClient & { calls: string[] } {
  const queue = [...responses];
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      const r = queue.shift();
      if (r === undefined) throw new Error("stubClient: no more responses queued");
      return r;
    },
  };
}

async function collect(
  company: string,
  fromDate: string,
  toDate: string,
  client: TallyClient,
  chunkDays?: number,
) {
  const out = [];
  for await (const chunk of getDayBookStream(client, {
    company,
    fromDate: fromDate as never,
    toDate: toDate as never,
    chunkDays,
  })) {
    out.push(...chunk);
  }
  return out;
}

describe("getDayBookStream", () => {
  it("reconstructs one single-entry voucher per Day Book row", async () => {
    const client = stubClient([
      wrap(
        dayBookRow({
          date: "2026-04-05",
          type: "Payment",
          num: "P-1",
          party: "HDFC Bank",
          narr: "Rent paid",
          amount: "-1000",
          ledger: "Rent",
        }),
      ),
    ]);
    const vouchers = await collect("Acme", "20260401", "20260430", client);
    expect(vouchers).toHaveLength(1);
    const v = vouchers[0]!;
    expect(v.date).toBe("20260405"); // dashed → compact YYYYMMDD
    expect(v.voucherType).toBe("Payment");
    expect(v.voucherNumber).toBe("P-1");
    expect(v.party).toBe("HDFC Bank");
    expect(v.narration).toBe("Rent paid");
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0]).toMatchObject({ ledger: "Rent", amount: -1000, isDeemedPositive: false });
  });

  it("fetches each chunk window with its own request", async () => {
    // 8-day range, 7-day chunks → 2 windows → 2 report-form requests.
    const client = stubClient([
      wrap(dayBookRow({ date: "2026-04-02", type: "Sales", num: "A", amount: "1000", ledger: "Sales" })),
      wrap(dayBookRow({ date: "2026-04-08", type: "Sales", num: "B", amount: "2000", ledger: "Sales" })),
    ]);
    const vouchers = await collect("Acme", "20260401", "20260408", client, 7);
    expect(client.calls).toHaveLength(2);
    expect(client.calls.every((c) => c.includes("TallyMcpTdlReport"))).toBe(true);
    expect(vouchers.map((v) => v.voucherNumber)).toEqual(["A", "B"]);
  });

  it("yields nothing for an empty period (header-only export upstream)", async () => {
    const client = stubClient([wrap("")]);
    const vouchers = await collect("Acme", "20260401", "20260401", client);
    expect(vouchers).toHaveLength(0);
  });
});
