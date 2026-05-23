import { escapeXmlText } from "./escape.js";

/**
 * Builds Tally `Export Data` request envelopes (Appendix A format).
 *
 * Submission scope is read-only: this module produces EXPORT envelopes only.
 * There is deliberately no IMPORT/alter envelope builder.
 */

/** A Tally date in `YYYYMMDD` form (Tally XML uses no separators). */
export type TallyDate = string;

export interface ExportEnvelopeOptions {
  /** Tally report identifier placed in `<ID>` (e.g. `"Trial Balance"`). */
  reportId: string;
  /** Exact company name as shown in List of Companies (often numeric-prefixed). */
  company?: string;
  /** Period start, `YYYYMMDD`. */
  fromDate?: TallyDate;
  /** Period end, `YYYYMMDD`. */
  toDate?: TallyDate;
  /** Report-specific static variables (e.g. `DSPSHOWNARRATIONS`), emitted before the format vars. */
  staticVariables?: Record<string, string>;
}

/** Period-scoped helper options shared by Day Book and the financial reports. */
interface PeriodOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

const STATIC_VAR_INDENT = "        ";

/** Builds an `Export Data` envelope. Every envelope requests UTF-8 XML output. */
export function buildExportEnvelope(options: ExportEnvelopeOptions): string {
  const vars: string[] = [];
  const add = (tag: string, value: string): void => {
    vars.push(`${STATIC_VAR_INDENT}<${tag}>${escapeXmlText(value)}</${tag}>`);
  };

  if (options.company !== undefined) add("SVCURRENTCOMPANY", options.company);
  if (options.fromDate !== undefined) add("SVFROMDATE", options.fromDate);
  if (options.toDate !== undefined) add("SVTODATE", options.toDate);
  for (const [tag, value] of Object.entries(options.staticVariables ?? {})) {
    add(tag, value);
  }
  add("SVEXPORTFORMAT", "$$SysName:XML");
  add("ENCODINGTYPE", "UTF8");

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>${escapeXmlText(options.reportId)}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
${vars.join("\n")}
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/** List of Companies — the only report needing no loaded company. */
export const listCompaniesEnvelope = (): string =>
  buildExportEnvelope({ reportId: "List of Companies" });

/** Company Information for the given company. */
export const companyInfoEnvelope = (o: { company: string }): string =>
  buildExportEnvelope({ reportId: "Company Info", company: o.company });

/** List of Ledgers (ledger masters). */
export const listLedgersEnvelope = (o: { company: string }): string =>
  buildExportEnvelope({ reportId: "List of Ledgers", company: o.company });

/** List of Groups (group masters). */
export const listGroupsEnvelope = (o: { company: string }): string =>
  buildExportEnvelope({ reportId: "List of Groups", company: o.company });

/** List of Voucher Types. */
export const listVoucherTypesEnvelope = (o: { company: string }): string =>
  buildExportEnvelope({ reportId: "List of Voucher Types", company: o.company });

/** Day Book for a date range, with narrations included. */
export const dayBookEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Day Book",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
    staticVariables: { DSPSHOWNARRATIONS: "Yes" },
  });

/** Trial Balance for a date range, with the grand total row. */
export const trialBalanceEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Trial Balance",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
    staticVariables: { DSPSHOWGRANDTOTAL: "Yes" },
  });

/** Profit & Loss A/c (raw Tally structure) for a date range. */
export const profitAndLossEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Profit & Loss A/c",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });

/** Balance Sheet (raw Tally structure) for a date range. */
export const balanceSheetEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Balance Sheet",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });

/** Sales Register for a date range. */
export const salesRegisterEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Sales Register",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });
