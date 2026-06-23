import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import { dayBookEnvelope, findAllObjects, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { toVoucher } from "../voucher-normalize.js";
import { getLoadedPeriod } from "./current-company.js";
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
  const seen = new Set<string>();
  const { fromDate, toDate } = options;

  // A bare `Voucher` collection ignores SVFROMDATE/SVTODATE — Tally serves the
  // company's currently-loaded period for EVERY request. So the only way to
  // guarantee the requested range is fully covered is to prove the loaded
  // period contains it. Gate up front and FAIL CLOSED: refuse unless coverage
  // is proven. (Refusing rather than returning a partial set keeps the
  // "exact period, never silently understated" guarantee.) A request that fits
  // inside the loaded period is then date-filtered to exactly the range; an
  // empty in-range result is valid (that period simply has no vouchers).
  const loaded = await getLoadedPeriod(client, options.company);
  if (!loaded) {
    throw new TallyReportError("DayBook", [
      `Could not confirm TallyPrime's currently-loaded period, so live voucher streaming cannot ` +
        `prove it covers ${fromDate}–${toDate} and might silently return a partial set. Set the period ` +
        `in TallyPrime (Gateway of Tally → F2: Date) to cover that range, or use ` +
        `tally_import_vouchers_from_file.`,
    ]);
  }
  if (fromDate < loaded.from || toDate > loaded.to) {
    throw new TallyReportError("DayBook", [
      `Live voucher streaming can read only TallyPrime's currently-loaded period ` +
        `(${loaded.from}–${loaded.to}); the requested range ${fromDate}–${toDate} extends beyond it, so ` +
        `the result would be incomplete. Set the period in TallyPrime (Gateway of Tally → F2: Date) to ` +
        `cover ${fromDate}–${toDate}, or use tally_import_vouchers_from_file for an out-of-period range.`,
    ]);
  }

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
    const batch: Voucher[] = [];
    for (const node of findAllObjects(raw, "VOUCHER")) {
      const v = toVoucher(node);
      // Keep only the requested range; Tally returns the whole loaded period.
      if (v.date < fromDate || v.date > toDate) continue;
      // Fingerprint covers every distinguishing field — date, type, number,
      // party, reference, narration, and each posting (ledger/amount/Dr-Cr) — so
      // byte-identical chunk repeats collapse while two genuinely different
      // vouchers (even sharing a number) keep distinct fingerprints and survive.
      // JSON.stringify keeps it unambiguous and text-diffable (no separator
      // collisions, no control characters in the source).
      const fingerprint = JSON.stringify([
        v.date,
        v.voucherType,
        v.voucherNumber ?? "",
        v.party ?? "",
        v.reference ?? "",
        v.narration ?? "",
        v.entries.map((e) => [e.ledger, e.amount, e.isDeemedPositive]),
      ]);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      batch.push(v);
    }
    if (batch.length) yield batch;
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
