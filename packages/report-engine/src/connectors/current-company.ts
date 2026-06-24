import {
  currentCompanyEnvelope,
  findAll,
  nodeText,
  parseTallyResponse,
} from "@tallymcp/tally-xml";
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
