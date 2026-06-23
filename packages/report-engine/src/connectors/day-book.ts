import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import type { TallyClient } from "../client.js";
import { getDayBookStream } from "./day-book-stream.js";

export interface GetDayBookOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
  /**
   * Date-chunking window in days (default 7). Each chunk is one Tally request;
   * a smaller window bounds memory + response size on large books. Shared with
   * the streaming reader so the report and the CSV export chunk identically.
   */
  chunkDays?: number;
}

/**
 * Reads the Day Book for the period as fully-detailed vouchers — one entry per
 * ledger posting (real ledger names + signed amounts) — by collecting the
 * memory-safe raw-voucher stream.
 *
 * Earlier versions used an inline-TDL projection that exposed only the
 * voucher's primary `$Amount`/`$LedgerName` (one ledger per voucher); a raw
 * `Voucher` collection cannot project the full per-line breakdown. The Excel
 * export flattens each voucher into one row per ledger line (Dr/Cr); the JSON
 * export keeps the nested voucher structure.
 */
export async function getDayBook(
  client: TallyClient,
  options: GetDayBookOptions,
): Promise<Voucher[]> {
  const vouchers: Voucher[] = [];
  for await (const chunk of getDayBookStream(client, options)) {
    vouchers.push(...chunk);
  }
  return vouchers;
}
