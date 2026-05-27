import { CompanySchema, type Company } from "@tallymcp/shared-types";
import { companyInfoEnvelope, findAllObjects, parseTallyResponse } from "@tallymcp/tally-xml";
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
  return CompanySchema.parse({
    id: String(node["@_NAME"] ?? node.NAME ?? options.company),
    name: String(node.NAME ?? node["@_NAME"] ?? options.company),
    startingFrom: normalizeTallyDate(node.STARTINGFROM),
    booksFrom: normalizeTallyDate(node.BOOKSFROM),
    baseCurrency: node.BASECURRENCY ? String(node.BASECURRENCY) : undefined,
    gstin: node.GSTIN ? String(node.GSTIN) : undefined,
  });
}

