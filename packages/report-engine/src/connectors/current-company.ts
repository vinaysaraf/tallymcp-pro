import { currentCompanyEnvelope, findAll, nodeText, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";

/**
 * Returns Tally's ACTUAL current company after requesting a switch to
 * `company` (via `SVCURRENTCOMPANY`). Tally silently serves the active company
 * when the requested one can't be selected, so callers compare this against the
 * requested name to avoid trusting (and exporting) a different company's books.
 *
 * Returns an empty string if Tally reports no current company.
 */
export async function getCurrentCompany(client: TallyClient, company: string): Promise<string> {
  const xml = await client.post(currentCompanyEnvelope(company), { charset: "utf-8" });
  const [cmp] = findAll(parseTallyResponse(xml).raw, "CMP");
  return nodeText(cmp).trim();
}
