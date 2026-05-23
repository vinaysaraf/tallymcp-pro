import { CompanySchema, type Company } from "@tallymcp/shared-types";
import { findAll, listCompaniesEnvelope, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/** Reads the `List of Companies` report. */
export async function listCompanies(client: TallyClient): Promise<Company[]> {
  const xml = await client.post(listCompaniesEnvelope());
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("ListOfCompanies", lineErrors);
  const nodes = findAll(raw, "COMPANY") as Array<Record<string, unknown>>;
  return nodes.map(toCompany);
}

function toCompany(node: Record<string, unknown>): Company {
  const idOrName = String(node["@_NAME"] ?? node.NAME ?? "");
  return CompanySchema.parse({
    id: idOrName,
    name: String(node.NAME ?? idOrName),
    startingFrom: String(node.STARTINGFROM ?? ""),
    booksFrom: node.BOOKSFROM ? String(node.BOOKSFROM) : undefined,
    baseCurrency: node.BASECURRENCY ? String(node.BASECURRENCY) : undefined,
    gstin: node.GSTIN ? String(node.GSTIN) : undefined,
  });
}
