import { CompanySchema, type Company } from "@tallymcp/shared-types";
import { findAll, listCompaniesEnvelope, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Reads the `List of Companies` report.
 *
 * Tally's element layout varies by edition:
 *   - TallyPrime 4.x: `<COMPANY NAME="...">…</COMPANY>` with rich child fields.
 *   - TallyPrime Silver / older: `<CMPINFO><COMPANYNAME>…</COMPANYNAME></CMPINFO>` —
 *     only the company name is returned, no STARTINGFROM/GSTIN.
 *
 * We prefer the rich shape; if it is absent we fall back to the name-only shape
 * so the loaded company surfaces consistently across Tally versions.
 */
export async function listCompanies(client: TallyClient): Promise<Company[]> {
  const xml = await client.post(listCompaniesEnvelope());
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("ListOfCompanies", lineErrors);

  const richNodes = findAll(raw, "COMPANY") as Array<Record<string, unknown>>;
  if (richNodes.length > 0) return richNodes.map(toCompany);

  // Older-Tally fallback: leaf <COMPANYNAME>…</COMPANYNAME> nodes.
  const nameNodes = findAll(raw, "COMPANYNAME");
  const names = nameNodes
    .map((n) => (typeof n === "string" ? n : typeof n === "number" ? String(n) : ""))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return names.map((name) =>
    CompanySchema.parse({ id: name, name }),
  );
}

function toCompany(node: Record<string, unknown>): Company {
  const idOrName = String(node["@_NAME"] ?? node.NAME ?? "");
  const startingFrom = node.STARTINGFROM ? String(node.STARTINGFROM) : undefined;
  return CompanySchema.parse({
    id: idOrName,
    name: String(node.NAME ?? idOrName),
    startingFrom,
    booksFrom: node.BOOKSFROM ? String(node.BOOKSFROM) : undefined,
    baseCurrency: node.BASECURRENCY ? String(node.BASECURRENCY) : undefined,
    gstin: node.GSTIN ? String(node.GSTIN) : undefined,
  });
}
