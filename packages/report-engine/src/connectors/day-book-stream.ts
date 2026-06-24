import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import type { TallyClient } from "../client.js";
import { getDayBook, type GetDayBookOptions } from "./day-book.js";

/**
 * Memory-bounded Day Book reader.
 *
 * Yields one `Voucher[]` per chunk window so callers (the CSV voucher export
 * and audit-lite) can process a long period without holding the whole FY at
 * once. Each window is fetched through {@link getDayBook} — i.e. the SAME
 * inline report-form TDL the non-streaming reader and `runReport("DayBook")`
 * use.
 *
 * Why not a bare `Voucher` collection (the pre-v1.0.6 approach)? On TallyPrime
 * Silver (and other editions that don't answer standalone collection exports) a
 * `TYPE=Collection` Voucher request returns an empty set, AND it ignores
 * `SVFROMDATE`/`SVTODATE` — Tally serves whatever period is loaded. The
 * report-form TDL honors the requested period natively (proven by the per-FY
 * Day Book count grid in `run-all-features --probe`), so there is no longer any
 * need to probe and gate on Tally's loaded period. Disjoint windows can't
 * produce cross-window duplicates, so no de-duplication is required either.
 *
 * Each row becomes one `Voucher` whose single entry carries the voucher's
 * primary `$Amount` (Tally's signed per-voucher total); see {@link getDayBook}.
 */
export async function* getDayBookStream(
  client: TallyClient,
  options: GetDayBookOptions,
): AsyncGenerator<Voucher[], void, undefined> {
  const chunkDays = options.chunkDays && options.chunkDays > 0 ? options.chunkDays : 31;
  for (const window of chunkDateRange(options.fromDate, options.toDate, chunkDays)) {
    const vouchers = await getDayBook(client, {
      company: options.company,
      fromDate: window.fromDate,
      toDate: window.toDate,
    });
    if (vouchers.length > 0) yield vouchers;
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
