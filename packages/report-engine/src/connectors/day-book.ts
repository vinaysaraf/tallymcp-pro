import { VoucherSchema, type TallyDate, type Voucher } from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

export interface GetDayBookOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
  /**
   * Date-chunking window in days. Default 0 (single request for the whole
   * period) — inline TDL handles a full FY in ~7 s on Silver against a
   * 21k-voucher book. Set to a positive integer to chunk for huge ranges.
   */
  chunkDays?: number;
}

interface TdlDayBookRow {
  date: string;
  voucherType: string;
  voucherNumber: string;
  party: string;
  reference: string;
  narration: string;
  amount: number;
}

/**
 * Reads the Day Book for the period via the inline-TDL engine.
 *
 * Returns one `Voucher` per Tally voucher object. The amount stored in
 * `entries[0]` is the voucher's primary `$Amount` (Tally's signed total),
 * because TDL's voucher collection exposes that as the natural per-voucher
 * value. Ledger-level entry breakdown would require nested `*.LIST` TDL
 * projections, which are a v0.7.2 enhancement.
 */
export async function getDayBook(
  client: TallyClient,
  options: GetDayBookOptions,
): Promise<Voucher[]> {
  const chunkDays = options.chunkDays ?? 0;
  if (chunkDays > 0) {
    const vouchers: Voucher[] = [];
    for (const window of chunkDateRange(options.fromDate, options.toDate, chunkDays)) {
      const part = await fetchOne(client, options.company, window.fromDate, window.toDate);
      vouchers.push(...part);
    }
    return vouchers;
  }
  return fetchOne(client, options.company, options.fromDate, options.toDate);
}

async function fetchOne(
  client: TallyClient,
  company: string,
  fromDate: TallyDate,
  toDate: TallyDate,
): Promise<Voucher[]> {
  const report = getReport("day-book");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlDayBookRow>(client, report, template, {
    fromDate: toDate2Date(fromDate),
    toDate: toDate2Date(toDate),
    targetCompany: company,
  });
  return rows.map(toVoucher);
}

function toVoucher(row: TdlDayBookRow): Voucher {
  // Convert ISO date (YYYY-MM-DD) → Tally compact (YYYYMMDD)
  const date = row.date.replace(/-/g, "") as TallyDate;
  return VoucherSchema.parse({
    date,
    voucherType: row.voucherType || "Unknown",
    voucherNumber: row.voucherNumber || undefined,
    party: row.party || undefined,
    reference: row.reference || undefined,
    narration: row.narration || undefined,
    entries: [
      {
        ledger: row.party || row.voucherType || "Unknown",
        amount: row.amount,
        isDeemedPositive: row.amount >= 0,
      },
    ],
  });
}

function toDate2Date(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}

const fmt = (d: Date): TallyDate =>
  (`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`) as TallyDate;

function* chunkDateRange(
  from: TallyDate,
  to: TallyDate,
  days: number,
): Generator<{ fromDate: TallyDate; toDate: TallyDate }> {
  if (days <= 0) throw new Error("chunkDays must be positive");
  const fromD = toDate2Date(from);
  const toD = toDate2Date(to);
  if (fromD.getTime() > toD.getTime()) return;
  let cur = new Date(fromD);
  while (cur.getTime() <= toD.getTime()) {
    const end = new Date(cur);
    end.setDate(end.getDate() + days - 1);
    const chunkEnd = end.getTime() > toD.getTime() ? new Date(toD) : end;
    yield { fromDate: fmt(cur), toDate: fmt(chunkEnd) };
    const next = new Date(chunkEnd);
    next.setDate(next.getDate() + 1);
    cur = next;
  }
}
