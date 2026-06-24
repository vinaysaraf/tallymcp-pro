import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * List of Companies request — Collection + TDL form (cross-edition).
 *
 * This is the canonical, edition-safe request. The previous fallback used the
 * bare `TALLYREQUEST=Export Data, TYPE=Data` form, which on TallyPrime Silver
 * (and multi-company setups) returns an EMPTY `<DATA></DATA>` even when
 * companies ARE loaded — so the connection test wrongly reported
 * `NO_COMPANY_LOADED`. Because the deployed bundle ships no `samples/` dir,
 * `getListCompaniesEnvelope()` always fell back to that broken form in the
 * installed app (it only worked from a dev checkout where the samples file
 * exists). Making the constant the working Collection+TDL form fixes the
 * installed server with no file dependency. (Verified live against TallyPrime
 * Silver with 3 companies loaded.)
 */
export const LIST_COMPANIES_ENVELOPE = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <ENCODINGTYPE>UTF8</ENCODINGTYPE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Companies" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>Name,StartingFrom,BooksFrom,FormalName,GSTRegistrationNumber,BaseCurrencySymbol</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoSamplesPath = join(packageDir, "../../../samples/list-companies.request.xml");

export function getListCompaniesEnvelope(): string {
  const cwdPath = join(process.cwd(), "samples/list-companies.request.xml");
  for (const p of [cwdPath, repoSamplesPath]) {
    if (existsSync(p)) {
      return readFileSync(p, "utf8");
    }
  }
  return LIST_COMPANIES_ENVELOPE;
}
