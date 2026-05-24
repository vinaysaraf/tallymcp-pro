import { VoucherSchema, type TallyDate, type Voucher } from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

interface TdlSalesRow {
  date: string;
  voucherType: string;
  voucherNumber: string;
  party: string;
  reference: string;
  narration: string;
  amount: number;
}

/**
 * Reads the Sales Register for the period via the inline-TDL engine.
 *
 * Tally's TDL `$$IsSales:$VoucherTypeName` filter narrows the voucher
 * collection to sales-class vouchers server-side, so we receive only the
 * sales rows — fast and bandwidth-efficient.
 */
export async function getSalesRegister(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<Voucher[]> {
  const report = getReport("sales-register");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlSalesRow>(client, report, template, {
    fromDate: toDate(options.fromDate),
    toDate: toDate(options.toDate),
    targetCompany: options.company,
  });
  return rows.map(toVoucher);
}

function toVoucher(row: TdlSalesRow): Voucher {
  const date = row.date.replace(/-/g, "") as TallyDate;
  return VoucherSchema.parse({
    date,
    voucherType: row.voucherType || "Sales",
    voucherNumber: row.voucherNumber || undefined,
    party: row.party || undefined,
    reference: row.reference || undefined,
    narration: row.narration || undefined,
    entries: [
      {
        ledger: row.party || "Sales",
        amount: row.amount,
        isDeemedPositive: row.amount >= 0,
      },
    ],
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
