import { CompanySchema, type Company } from "@tallymcp/shared-types";
import { companyInfoEnvelope, findAllObjects, nodeText, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { normalizeTallyDate } from "./date-utils.js";

/** Reads the `Company Info` report for the named company. */
export async function getCompanyInfo(
  client: TallyClient,
  options: { company: string },
): Promise<Company> {
  const xml = await client.post(companyInfoEnvelope({ company: options.company }), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("CompanyInfo", lineErrors);
  const nodes = findAllObjects(raw, "COMPANY");
  const node = nodes[0];
  if (!node) {
    throw new TallyReportError("CompanyInfo", ["No COMPANY element in response"]);
  }
  const id = nodeText(node["@_NAME"]) || nodeText(node.NAME) || options.company;
  const baseCurrency = nodeText(node.BASECURRENCY);
  const gstin = nodeText(node.GSTIN);
  return CompanySchema.parse({
    id,
    name: nodeText(node.NAME) || nodeText(node["@_NAME"]) || options.company,
    startingFrom: normalizeTallyDate(node.STARTINGFROM),
    booksFrom: normalizeTallyDate(node.BOOKSFROM),
    baseCurrency: baseCurrency || undefined,
    gstin: gstin || undefined,
  });
}

