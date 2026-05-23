import { TallyAmountParseError } from "./errors.js";

/**
 * Parses a Tally amount string into a number.
 *
 * ```text
 *  ""                  -> 0
 *  "1,23,456.78"       -> 123456.78    (Indian lakh grouping)
 *  "-1,23,456.78"      -> -123456.78
 *  "(-)1,23,456.78 Dr" -> -123456.78
 *  "1,23,456.78 Dr"    -> 123456.78
 *  "1,23,456.78 Cr"    -> -123456.78   (Cr is normalized to negative)
 * ```
 *
 * Whether a bare `Dr`/`Cr`-less amount is debit or credit is decided by the
 * caller from the ledger line's `ISDEEMEDPOSITIVE` flag, not here.
 *
 * @throws {TallyAmountParseError} when the input is not a recognizable amount.
 */
export function parseTallyAmount(value: string): number {
  if (!value) return 0;
  let body = value.trim();
  if (!body) return 0;

  let sign = 1;
  if (body.startsWith("(-)")) {
    sign = -1;
    body = body.slice(3);
  } else if (body.startsWith("-")) {
    sign = -1;
    body = body.slice(1);
  }

  let crDr: "Cr" | "Dr" | null = null;
  if (body.endsWith(" Cr")) {
    crDr = "Cr";
    body = body.slice(0, -3);
  } else if (body.endsWith(" Dr")) {
    crDr = "Dr";
    body = body.slice(0, -3);
  }

  const n = Number(body.trim().replace(/,/g, ""));
  if (Number.isNaN(n)) throw new TallyAmountParseError(value);

  const signed = sign * n;
  return crDr === "Cr" ? -signed : signed;
}
