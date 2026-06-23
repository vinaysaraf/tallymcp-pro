import { describe, expect, it } from "vitest";
import { toVoucher } from "../src/voucher-normalize.js";

/**
 * `toVoucher` normalizes a parsed `<VOUCHER>` node (fast-xml-parser output)
 * into the domain Voucher type. It backs the streaming Day Book
 * (`day-book-stream.ts`), which parses raw `<VOUCHER>` nodes via
 * `findAllObjects`, so it is exposed to TallyPrime's habit of attaching
 * attributes to amount/text fields.
 */
describe("toVoucher", () => {
  it("normalizes a plain voucher node", () => {
    const v = toVoucher({
      DATE: "20260403",
      VOUCHERTYPENAME: "Sales",
      VOUCHERNUMBER: "S-1",
      PARTYLEDGERNAME: "Acme & Co",
      NARRATION: "Sale",
      "ALLLEDGERENTRIES.LIST": [
        { LEDGERNAME: "Sales", AMOUNT: "-1,18,000.00", ISDEEMEDPOSITIVE: "No" },
        { LEDGERNAME: "Acme & Co", AMOUNT: "1,18,000.00", ISDEEMEDPOSITIVE: "Yes" },
      ],
    });
    expect(v.date).toBe("20260403");
    expect(v.voucherType).toBe("Sales");
    expect(v.party).toBe("Acme & Co");
    expect(v.entries).toHaveLength(2);
    expect(v.entries[0]?.amount).toBe(-118000);
    expect(v.entries[1]?.amount).toBe(118000);
    expect(v.entries[1]?.isDeemedPositive).toBe(true);
  });

  it("parses attribute-carrying AMOUNT/LEDGERNAME without the [object Object] crash (v1.0.8 regression fix)", () => {
    // <AMOUNT TYPE="Amount" ISDEEMEDPOSITIVE="No">-1,18,000.00</AMOUNT> →
    // { "@_TYPE": "Amount", "@_ISDEEMEDPOSITIVE": "No", "#text": "-1,18,000.00" }
    // Before the fix String(e.AMOUNT) produced "[object Object]" → parseTallyAmount threw.
    const v = toVoucher({
      DATE: { "@_TYPE": "Date", "#text": "20260403" },
      VOUCHERTYPENAME: { "@_TYPE": "String", "#text": "Sales" },
      PARTYLEDGERNAME: { "@_TYPE": "String", "#text": "Acme & Co" },
      "ALLLEDGERENTRIES.LIST": {
        LEDGERNAME: { "@_TYPE": "String", "#text": "Sales" },
        AMOUNT: { "@_TYPE": "Amount", "#text": "-1,18,000.00" },
        ISDEEMEDPOSITIVE: { "@_TYPE": "Logical", "#text": "No" },
      },
    });
    expect(v.date).toBe("20260403");
    expect(v.voucherType).toBe("Sales");
    expect(v.party).toBe("Acme & Co");
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0]?.ledger).toBe("Sales");
    expect(v.entries[0]?.amount).toBe(-118000);
    expect(v.entries[0]?.isDeemedPositive).toBe(false);
  });
});
