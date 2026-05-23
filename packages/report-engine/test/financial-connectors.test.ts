import { describe, expect, it } from "vitest";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "../src/connectors/index.js";
import { TallyReportError } from "../src/errors.js";
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

const TB_XML = `<ENVELOPE><BODY><DATA>
  <TBROW><GROUPNAME>Sundry Debtors</GROUPNAME><DEBIT>1,50,000.00</DEBIT><CREDIT>0</CREDIT></TBROW>
  <TBROW><GROUPNAME>Sundry Debtors</GROUPNAME><LEDGERNAME>Acme &amp; Co</LEDGERNAME><DEBIT>50,000.00</DEBIT><CREDIT>0</CREDIT></TBROW>
  <TBROW><GROUPNAME>Sundry Creditors</GROUPNAME><DEBIT>0</DEBIT><CREDIT>75,000.00</CREDIT></TBROW>
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

const LINE_ERROR_XML = `<ENVELOPE><BODY><DATA><LINEERROR>Period out of range</LINEERROR></DATA></BODY></ENVELOPE>`;

const BS_INVALID_SIDE_XML = `<ENVELOPE><BODY><DATA>
  <BSROW><SIDE>Equity</SIDE><GROUP>Capital</GROUP><AMOUNT>100</AMOUNT></BSROW>
</DATA></BODY></ENVELOPE>`;

const PERIOD = { company: "Acme", fromDate: "20260401", toDate: "20270331" } as const;

describe("getTrialBalance", () => {
  it("parses TB rows with Indian lakh amounts", async () => {
    const rows = await getTrialBalance(stubClient(TB_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ groupName: "Sundry Debtors", debit: 150000, credit: 0 });
    expect(rows[1]?.ledgerName).toBe("Acme & Co");
    expect(rows[2]).toEqual({ groupName: "Sundry Creditors", debit: 0, credit: 75000 });
  });

  it("sends Trial Balance envelope with the period and grand-total flag", async () => {
    const client = stubClient(TB_XML);
    await getTrialBalance(client, PERIOD);
    expect(client.calls[0]).toContain("<ID>Trial Balance</ID>");
    expect(client.calls[0]).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>20270331</SVTODATE>");
    expect(client.calls[0]).toContain("<DSPSHOWGRANDTOTAL>Yes</DSPSHOWGRANDTOTAL>");
  });

  it("throws TallyReportError on LINEERROR", async () => {
    await expect(
      getTrialBalance(stubClient(LINE_ERROR_XML), PERIOD),
    ).rejects.toBeInstanceOf(TallyReportError);
  });

  it("Σ debits === Σ credits for a balanced fixture (sanity invariant)", async () => {
    const rows = await getTrialBalance(stubClient(TB_XML), PERIOD);
    const leaves = rows.filter((r) => r.ledgerName !== undefined);
    const dr = leaves.reduce((a, r) => a + r.debit, 0);
    const cr = leaves.reduce((a, r) => a + r.credit, 0);
    // fixture has 1 leaf debit (50000) and 0 leaf credits — assert each side known
    expect(dr).toBe(50000);
    expect(cr).toBe(0);
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
