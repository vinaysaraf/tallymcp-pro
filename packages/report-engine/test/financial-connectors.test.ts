import { describe, expect, it } from "vitest";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "../src/connectors/index.js";
// TallyReportError is still used by P&L / BS connector tests below.
import { TallyReportError } from "../src/errors.js";
void TallyReportError;
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

// v0.7.0 — trial-balance.xml is an inline-TDL report; rows come as
// <ROW><F01>...<F06> projecting Name, Parent, Opening, Debit, Credit, Closing.
const TB_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Sundry Debtors Total</F01><F02></F02><F03>0</F03><F04>150000</F04><F05>0</F05><F06>150000</F06></ROW>
  <ROW><F01>Acme &amp; Co</F01><F02>Sundry Debtors</F02><F03>0</F03><F04>50000</F04><F05>0</F05><F06>50000</F06></ROW>
  <ROW><F01>Sundry Creditors Total</F01><F02></F02><F03>0</F03><F04>0</F04><F05>75000</F05><F06>-75000</F06></ROW>
</DATA></BODY></ENVELOPE>`;

const PL_XML = `<ENVELOPE><BODY><DATA>
  <PLROW><HEAD>Sales Accounts</HEAD><AMOUNT>15,00,000.00</AMOUNT></PLROW>
  <PLROW><HEAD>Direct Expenses</HEAD><SUBHEAD>Freight</SUBHEAD><LEDGER>Inward Freight</LEDGER><AMOUNT>25,000.00</AMOUNT></PLROW>
  <PLROW><HEAD>Indirect Expenses</HEAD><AMOUNT>2,50,000.00</AMOUNT></PLROW>
</DATA></BODY></ENVELOPE>`;

const BS_XML = `<ENVELOPE><BODY><DATA>
  <BSROW><SIDE>Assets</SIDE><GROUP>Current Assets</GROUP><AMOUNT>5,00,000.00</AMOUNT></BSROW>
  <BSROW><SIDE>Assets</SIDE><GROUP>Current Assets</GROUP><SUBGROUP>Sundry Debtors</SUBGROUP><LEDGER>Acme</LEDGER><AMOUNT>50,000.00</AMOUNT></BSROW>
  <BSROW><SIDE>Liabilities</SIDE><GROUP>Capital Account</GROUP><AMOUNT>3,00,000.00</AMOUNT></BSROW>
</DATA></BODY></ENVELOPE>`;

const BS_INVALID_SIDE_XML = `<ENVELOPE><BODY><DATA>
  <BSROW><SIDE>Equity</SIDE><GROUP>Capital</GROUP><AMOUNT>100</AMOUNT></BSROW>
</DATA></BODY></ENVELOPE>`;

const PERIOD = { company: "Acme", fromDate: "20260401", toDate: "20270331" } as const;

describe("getTrialBalance (TDL-backed in v0.7.0)", () => {
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

  it("sends an inline-TDL REPORT/COLLECTION envelope (not the legacy report form)", async () => {
    const client = stubClient(TB_XML);
    await getTrialBalance(client, PERIOD);
    expect(client.calls[0]).toContain('<REPORT NAME="TallyMcpTdlReport">');
    expect(client.calls[0]).toContain('<COLLECTION NAME="TallyMcpCollection">');
    expect(client.calls[0]).toContain("<TYPE>Ledger</TYPE>");
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2027</SVTODATE>");
  });

  it("throws on Tally <EXCEPTION> response", async () => {
    const exceptionXml = `<EXCEPTION>Period out of range</EXCEPTION>`;
    await expect(getTrialBalance(stubClient(exceptionXml), PERIOD)).rejects.toThrow(
      /Tally returned <EXCEPTION>/,
    );
  });
});

describe("getProfitAndLoss", () => {
  it("parses head-only and leaf rows", async () => {
    const rows = await getProfitAndLoss(stubClient(PL_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ head: "Sales Accounts", amount: 1500000 });
    expect(rows[1]?.subHead).toBe("Freight");
    expect(rows[1]?.ledger).toBe("Inward Freight");
    expect(rows[1]?.amount).toBe(25000);
  });

  it("sends Profit & Loss A/c envelope with escaped &", async () => {
    const client = stubClient(PL_XML);
    await getProfitAndLoss(client, PERIOD);
    expect(client.calls[0]).toContain("<ID>Profit &amp; Loss A/c</ID>");
    expect(client.calls[0]).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
  });
});

describe("getBalanceSheet", () => {
  it("parses Assets and Liabilities rows", async () => {
    const rows = await getBalanceSheet(stubClient(BS_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.side).toBe("Assets");
    expect(rows[1]?.subGroup).toBe("Sundry Debtors");
    expect(rows[1]?.ledger).toBe("Acme");
    expect(rows[2]?.side).toBe("Liabilities");
  });

  it("rejects an invalid side (Zod enum guard)", async () => {
    await expect(
      getBalanceSheet(stubClient(BS_INVALID_SIDE_XML), PERIOD),
    ).rejects.toThrow();
  });

  it("sends Balance Sheet envelope with the period", async () => {
    const client = stubClient(BS_XML);
    await getBalanceSheet(client, PERIOD);
    expect(client.calls[0]).toContain("<ID>Balance Sheet</ID>");
    expect(client.calls[0]).toContain("<SVTODATE>20270331</SVTODATE>");
  });
});
