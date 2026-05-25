import { CompanySchema, type Company, type TallyDate } from "@tallymcp/shared-types";
import { companyInfoEnvelope, findAllObjects, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

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

/**
 * Tally's per-master date fields (`STARTINGFROM`, `BOOKSFROM`) come back in
 * mixed formats depending on edition: `20220401` (YYYYMMDD, modern) or
 * `1-Apr-2022` (display format, Silver). Normalize to the YYYYMMDD form the
 * shared-types `TallyDateSchema` requires.
 */
function normalizeTallyDate(value: unknown): TallyDate | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return s as TallyDate;

  // Try `d-MMM-yyyy` (e.g. "1-Apr-2022")
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const month = months[m[2]!.toLowerCase()];
    const year = m[3]!;
    if (month) return `${year}${month}${day}` as TallyDate;
  }
  return undefined;
}
