import type { TallyDate } from "@tallymcp/shared-types";

/**
 * Normalize a Tally date string to the canonical YYYYMMDD form that
 * `@tallymcp/shared-types`' `TallyDateSchema` requires.
 *
 * Tally's per-master date fields (`STARTINGFROM`, `BOOKSFROM`, etc.) come
 * back in mixed formats depending on edition + the company's date-display
 * setting:
 *
 *   - `20240401` — canonical YYYYMMDD; TallyPrime 4.x default.
 *   - `1-Apr-2024` — display format; TallyPrime Silver + some TallyPrime
 *     installs where the company's date display preference is set to
 *     "D-MMM-YYYY". The XML response leaks the display format here even
 *     though voucher-date fields stay YYYYMMDD.
 *
 * Returns `undefined` when the input is missing, empty, or in an
 * unrecognized format — `TallyDateSchema` is `.optional()` on
 * `CompanySchema` so callers can fall back gracefully (the company name
 * still surfaces; only the FY-start metadata is lost).
 *
 * Shared between `company-info` (Phase 1 — always normalized) and
 * `list-companies` (Phase 1.0.2 — previously bypassed; now consistent).
 */
export function normalizeTallyDate(value: unknown): TallyDate | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return s as TallyDate;

  // Try `d-MMM-yyyy` (e.g. "1-Apr-2024", "01-Oct-2024", "31-DEC-2023")
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const month = months[m[2]!.toLowerCase()];
    const year = m[3]!;
    if (month) return `${year}${month}${day}` as TallyDate;
  }
  return undefined;
}
