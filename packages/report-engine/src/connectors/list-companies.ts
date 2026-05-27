import { CompanySchema, type Company } from "@tallymcp/shared-types";
import { findAll, findAllObjects, listCompaniesEnvelope, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { normalizeTallyDate } from "./date-utils.js";

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
  const xml = await client.post(listCompaniesEnvelope(), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("ListOfCompanies", lineErrors);

  const richNodes = findAllObjects(raw, "COMPANY");
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
  // Tally returns STARTINGFROM + BOOKSFROM in either canonical YYYYMMDD
  // (TallyPrime 4.x default) or display format like "1-Apr-2024" (Silver
  // + some networked TallyPrime installs where the company's date
  // display preference leaks into the XML response). normalizeTallyDate
  // handles both; returns undefined for unparseable inputs so the
  // optional schema field falls back gracefully — the company name still
  // surfaces. (Phase 1.0.2 fix; see ai-review/v1.0.1-real-world-hang.md.)
  return CompanySchema.parse({
    id: idOrName,
    name: String(node.NAME ?? idOrName),
    startingFrom: normalizeTallyDate(node.STARTINGFROM),
    booksFrom: normalizeTallyDate(node.BOOKSFROM),
    baseCurrency: node.BASECURRENCY ? String(node.BASECURRENCY) : undefined,
    gstin: node.GSTIN ? String(node.GSTIN) : undefined,
  });
}
