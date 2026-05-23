import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Canonical Appendix A List of Companies request (fallback if samples/ missing). */
export const LIST_COMPANIES_ENVELOPE = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <ENCODINGTYPE>UTF8</ENCODINGTYPE>
      </STATICVARIABLES>
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
