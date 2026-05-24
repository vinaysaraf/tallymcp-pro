import { describe, expect, it } from "vitest";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "../src/connectors/index.js";
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

// All financial connectors now go through @tallymcp/tdl-engine — responses are
// <DATA><ROW><F01>…<Fnn> projecting the TDL-defined columns.

const TB_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Sundry Debtors Total</F01><F02></F02><F03>0</F03><F04>150000</F04><F05>0</F05><F06>150000</F06></ROW>
  <ROW><F01>Acme &amp; Co</F01><F02>Sundry Debtors</F02><F03>0</F03><F04>50000</F04><F05>0</F05><F06>50000</F06></ROW>
  <ROW><F01>Sundry Creditors Total</F01><F02></F02><F03>0</F03><F04>0</F04><F05>75000</F05><F06>-75000</F06></ROW>
</DATA></BODY></ENVELOPE>`;

const PL_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Sales Accounts</F01><F02></F02><F03>-1500000</F03></ROW>
  <ROW><F01>Direct Expenses</F01><F02></F02><F03>250000</F03></ROW>
  <ROW><F01>Indirect Expenses</F01><F02></F02><F03>100000</F03></ROW>
</DATA></BODY></ENVELOPE>`;

const BS_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Current Assets</F01><F02></F02><F03>500000</F03></ROW>
  <ROW><F01>Sundry Debtors</F01><F02>Current Assets</F02><F03>150000</F03></ROW>
  <ROW><F01>Capital Account</F01><F02></F02><F03>-300000</F03></ROW>
</DATA></BODY></ENVELOPE>`;

const EXCEPTION_XML = `<EXCEPTION>Period out of range</EXCEPTION>`;

const PERIOD = { company: "Acme", fromDate: "20260401", toDate: "20270331" } as const;

describe("getTrialBalance (TDL-backed)", () => {
  it("parses TB rows from the inline-TDL ROW/F01..F06 shape", async () => {
    const rows = await getTrialBalance(stubClient(TB_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      groupName: "(top-level)",
      ledgerName: "Sundry Debtors Total",
      debit: 150000,
      credit: 0,
    });
    expect(rows[1]?.groupName).toBe("Sundry Debtors");
    expect(rows[1]?.ledgerName).toBe("Acme & Co");
    expect(rows[2]?.credit).toBe(75000);
  });

  it("sends an inline-TDL REPORT/COLLECTION envelope with period", async () => {
    const client = stubClient(TB_XML);
    await getTrialBalance(client, PERIOD);
    expect(client.calls[0]).toContain('<REPORT NAME="TallyMcpTdlReport">');
    expect(client.calls[0]).toContain('<COLLECTION NAME="TallyMcpCollection">');
    expect(client.calls[0]).toContain("<TYPE>Ledger</TYPE>");
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
  });

  it("throws on Tally <EXCEPTION> response", async () => {
    await expect(getTrialBalance(stubClient(EXCEPTION_XML), PERIOD)).rejects.toThrow(
      /Tally returned <EXCEPTION>/,
    );
  });
});

describe("getProfitAndLoss (TDL-backed)", () => {
  it("parses revenue groups with signed closing balances", async () => {
    const rows = await getProfitAndLoss(stubClient(PL_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ head: "Sales Accounts", amount: -1500000 });
    expect(rows[1]?.head).toBe("Direct Expenses");
    expect(rows[1]?.amount).toBe(250000);
  });

  it("sends a Group-collection TDL request filtered to IsRevenue", async () => {
    const client = stubClient(PL_XML);
    await getProfitAndLoss(client, PERIOD);
    expect(client.calls[0]).toContain("<TYPE>Group</TYPE>");
    expect(client.calls[0]).toContain("<FILTER>IsRevenueGrp</FILTER>");
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
  });
});

describe("getBalanceSheet (TDL-backed)", () => {
  it("parses non-revenue groups and classifies side from asset heuristics", async () => {
    const rows = await getBalanceSheet(stubClient(BS_XML), PERIOD);
    expect(rows).toHaveLength(3);
    // "Current Assets" group itself appears in the asset set → side=Assets
    expect(rows[0]?.group).toBe("Current Assets");
    expect(rows[0]?.side).toBe("Assets");
    // "Sundry Debtors" under "Current Assets" → side=Assets via parent
    expect(rows[1]?.side).toBe("Assets");
    expect(rows[1]?.subGroup).toBe("Current Assets");
    // "Capital Account" with no known asset parent → side=Liabilities
    expect(rows[2]?.side).toBe("Liabilities");
    expect(rows[2]?.amount).toBe(-300000);
  });

  it("sends a Group-collection TDL request filtered to NOT IsRevenue", async () => {
    const client = stubClient(BS_XML);
    await getBalanceSheet(client, PERIOD);
    expect(client.calls[0]).toContain("<TYPE>Group</TYPE>");
    expect(client.calls[0]).toContain("<FILTER>IsBSGrp</FILTER>");
  });
});
