import type { TallyDate } from "@tallymcp/shared-types";

/**
 * Resolves a `{ from, to }` reporting period.
 *
 * Priority (per submission plan §2.6):
 * 1. Explicit `fromDate` AND `toDate` — used as-is.
 * 2. `defaultFinancialYear` from config — used when no explicit range.
 * 3. Otherwise the *current* FY relative to `asOf`. The FY anchor (month + day)
 *    is taken from `company.startingFrom`; if no company is supplied the
 *    default is the Indian FY (Apr 1 – Mar 31).
 *
 * @throws if exactly one of `fromDate` / `toDate` is supplied.
 */
export interface ResolvePeriodOptions {
  fromDate?: TallyDate;
  toDate?: TallyDate;
  /** Reference date for "current FY". Defaults to `new Date()`. */
  asOf?: Date;
  /** Overrides the asOf-based FY computation. */
  defaultFinancialYear?: { from: TallyDate; to: TallyDate };
}

export interface ResolvedPeriod {
  from: TallyDate;
  to: TallyDate;
}

const INDIAN_FY_START_MONTH = 4;
const INDIAN_FY_START_DAY = 1;

const fmt = (year: number, month: number, day: number): TallyDate =>
  (`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`) as TallyDate;

function parseFyAnchor(date: TallyDate): { month: number; day: number } {
  return {
    month: Number(date.slice(4, 6)),
    day: Number(date.slice(6, 8)),
  };
}

export function resolvePeriod(
  company: { startingFrom?: TallyDate } | undefined | null,
  options: ResolvePeriodOptions = {},
): ResolvedPeriod {
  const { fromDate, toDate } = options;
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw new Error(
      "resolvePeriod: pass both fromDate and toDate, or neither (auto-resolve FY)",
    );
  }
  if (fromDate && toDate) {
    return { from: fromDate, to: toDate };
  }

  if (options.defaultFinancialYear) {
    return options.defaultFinancialYear;
  }

  const asOf = options.asOf ?? new Date();
  const anchor = company?.startingFrom
    ? parseFyAnchor(company.startingFrom)
    : { month: INDIAN_FY_START_MONTH, day: INDIAN_FY_START_DAY };

  const y = asOf.getFullYear();
  const candidate = new Date(y, anchor.month - 1, anchor.day);
  const fyStart =
    asOf.getTime() >= candidate.getTime()
      ? candidate
      : new Date(y - 1, anchor.month - 1, anchor.day);
  const fyEnd = new Date(fyStart.getFullYear() + 1, anchor.month - 1, anchor.day);
  fyEnd.setDate(fyEnd.getDate() - 1);

  return {
    from: fmt(fyStart.getFullYear(), fyStart.getMonth() + 1, fyStart.getDate()),
    to: fmt(fyEnd.getFullYear(), fyEnd.getMonth() + 1, fyEnd.getDate()),
  };
}
