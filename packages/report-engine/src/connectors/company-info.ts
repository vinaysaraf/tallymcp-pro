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
  // Tally's `Company` collection returns EVERY loaded company, not just the one
  // named in SVCURRENTCOMPANY — so we must pick the node whose name matches the
  // request. Taking the first node silently returned a DIFFERENT company's
  // metadata (the alphabetically-first / active one). Match by NAME / @_NAME.
  const nodes = findAllObjects(raw, "COMPANY");
  const node = nodes.find(
    (n) => nodeText(n["@_NAME"]) === options.company || nodeText(n.NAME) === options.company,
  );
  if (!node) {
    throw new TallyReportError("CompanyInfo", [
      `Company "${options.company}" was not found among the companies loaded in TallyPrime. ` +
        `Open it in Tally (Gateway of Tally → press F3 to select it), or run tally_list_companies ` +
        `to copy its exact name, then retry.`,
    ]);
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

