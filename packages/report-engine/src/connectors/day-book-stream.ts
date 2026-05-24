import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import { dayBookEnvelope, findAllObjects, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { toVoucher } from "../voucher-normalize.js";
import type { GetDayBookOptions } from "./day-book.js";

/**
 * Memory-safe Day Book reader.
 *
 * Yields one `Voucher[]` per chunked Tally request so callers (e.g. the CSV
 * voucher export) can stream rows to disk without ever holding the full FY in
 * memory.
 */
export async function* getDayBookStream(
  client: TallyClient,
  options: GetDayBookOptions,
): AsyncGenerator<Voucher[], void, undefined> {
  const chunkDays = options.chunkDays ?? 7;
  for (const window of chunkDateRange(options.fromDate, options.toDate, chunkDays)) {
    const xml = await client.post(
      dayBookEnvelope({
        company: options.company,
        fromDate: window.fromDate,
        toDate: window.toDate,
      }),
      { charset: "utf-8" },
    );
    const { raw, lineErrors } = parseTallyResponse(xml);
    if (lineErrors.length) throw new TallyReportError("DayBook", lineErrors);
    const nodes = findAllObjects(raw, "VOUCHER");
    yield nodes.map(toVoucher);
  }
}

const fmt = (d: Date): TallyDate =>
  (`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`) as TallyDate;

const parseTallyDate = (s: TallyDate): Date =>
  new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));

function* chunkDateRange(
  from: TallyDate,
  to: TallyDate,
  days: number,
): Generator<{ fromDate: TallyDate; toDate: TallyDate }> {
  if (days <= 0) throw new Error("chunkDays must be positive");
  const fromD = parseTallyDate(from);
  const toD = parseTallyDate(to);
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
