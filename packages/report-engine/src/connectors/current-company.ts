import {
  currentCompanyEnvelope,
  currentPeriodEnvelope,
  findAll,
  nodeText,
  parseTallyResponse,
} from "@tallymcp/tally-xml";
import type { TallyDate } from "@tallymcp/shared-types";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Returns Tally's ACTUAL current company after requesting a switch to
 * `company` (via `SVCURRENTCOMPANY`). Tally silently serves the active company
 * when the requested one can't be selected, so callers compare this against the
 * requested name to avoid trusting (and exporting) a different company's books.
 *
 * Throws {@link TallyReportError} if Tally reports a soft `<LINEERROR>` (e.g.
 * "Could not find Company"), so a definitive company-selection failure is
 * surfaced rather than silently degraded to a no-op. Returns an empty string
 * only when Tally reports neither a company nor an error (older/transient).
 */
export async function getCurrentCompany(client: TallyClient, company: string): Promise<string> {
  const xml = await client.post(currentCompanyEnvelope(company), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("CompanyInfo", lineErrors);
  const [cmp] = findAll(raw, "CMP");
  return nodeText(cmp).trim();
}

/**
 * Returns the company's currently-loaded period as `YYYYMMDD` bounds, or `null`
 * if Tally doesn't report it (older/transient). A bare `Voucher` collection
 * only ever serves this period, so callers use it to refuse a live voucher
 * request that extends beyond it (which would silently return incomplete data).
 */
export async function getLoadedPeriod(
  client: TallyClient,
  company: string,
): Promise<{ from: TallyDate; to: TallyDate } | null> {
  const xml = await client.post(currentPeriodEnvelope(company), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("CompanyInfo", lineErrors);
  const from = nodeText(findAll(raw, "PFROM")[0]).replace(/-/g, "").trim();
  const to = nodeText(findAll(raw, "PTO")[0]).replace(/-/g, "").trim();
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) return null;
  return { from: from as TallyDate, to: to as TallyDate };
}
