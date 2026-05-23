import { escapeXmlText } from "./escape.js";

/**
 * Builds Tally XML request envelopes (Appendix A format).
 *
 * Submission scope is read-only: this module produces EXPORT envelopes only.
 * There is deliberately no IMPORT/alter envelope builder.
 *
 * Two flavours are exposed:
 *
 *  - {@link buildExportEnvelope} — `TALLYREQUEST=Export Data, TYPE=Data` form.
 *    Targets named Tally reports (Trial Balance, Profit & Loss, Balance Sheet…).
 *    This is what TallyPrime 4.x accepts. Older editions (TallyPrime Silver
 *    2.x / 3.x) tend to answer these with `STATUS=0` and an empty `<DATA/>`.
 *
 *  - {@link buildCollectionEnvelope} — `TALLYREQUEST=Export, TYPE=Collection`
 *    with an inline TDL `<COLLECTION>` definition. Works across editions
 *    (including TallyPrime Silver) and is what masters and vouchers use.
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
  /** Report-specific static variables (e.g. `DSPSHOWNARRATIONS`). */
  staticVariables?: Record<string, string>;
}

/** Period-scoped helper options shared by Day Book and the financial reports. */
interface PeriodOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

const STATIC_VAR_INDENT = "        ";

function renderStaticVars(options: {
  company?: string;
  fromDate?: TallyDate;
  toDate?: TallyDate;
  staticVariables?: Record<string, string>;
  withExportFormat: boolean;
}): string {
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
  if (options.withExportFormat) {
    add("SVEXPORTFORMAT", "$$SysName:XML");
    add("ENCODINGTYPE", "UTF8");
  }
  return vars.join("\n");
}

/** Builds an `Export Data` envelope (TYPE=Data — TallyPrime 4.x report form). */
export function buildExportEnvelope(options: ExportEnvelopeOptions): string {
  const vars = renderStaticVars({
    company: options.company,
    fromDate: options.fromDate,
    toDate: options.toDate,
    staticVariables: options.staticVariables,
    withExportFormat: true,
  });

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
${vars}
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export interface CollectionEnvelopeOptions {
  /** Used both as `<ID>` and the `<COLLECTION NAME="...">` attribute. */
  name: string;
  /** Tally object type: `Company`, `Ledger`, `Group`, `VoucherType`, `StockItem`, `Voucher`. */
  type: string;
  /** Optional `FETCH` list (Tally's projection clause). */
  fetch?: ReadonlyArray<string>;
  /** Period-scoped collections (vouchers) require these in static variables. */
  company?: string;
  fromDate?: TallyDate;
  toDate?: TallyDate;
  /** Extra static variables to inject before the export-format pair. */
  staticVariables?: Record<string, string>;
}

/** Builds an `Export` envelope (TYPE=Collection + inline TDL). */
export function buildCollectionEnvelope(options: CollectionEnvelopeOptions): string {
  const vars = renderStaticVars({
    company: options.company,
    fromDate: options.fromDate,
    toDate: options.toDate,
    staticVariables: options.staticVariables,
    withExportFormat: true,
  });

  const fetchLine =
    options.fetch && options.fetch.length > 0
      ? `\n            <FETCH>${escapeXmlText(options.fetch.join(","))}</FETCH>`
      : "";

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>${escapeXmlText(options.name)}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
${vars}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="${escapeXmlText(options.name)}" ISMODIFY="No">
            <TYPE>${escapeXmlText(options.type)}</TYPE>${fetchLine}
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ─── Per-report envelope helpers ─────────────────────────────────────────────
//
// Masters and vouchers use the cross-edition-safe Collection+TDL form. Period
// reports (Trial Balance, Profit & Loss, Balance Sheet) stay on the legacy
// Report form for now; on TallyPrime Silver these return STATUS=0 and need a
// dedicated TDL Ledger-balance projection to surface data — tracked as a
// v0.5.1 follow-up.

const COMPANY_FETCH = [
  "Name",
  "StartingFrom",
  "BooksFrom",
  "FormalName",
  "GSTRegistrationNumber",
  "BaseCurrencySymbol",
] as const;

const LEDGER_FETCH = [
  "Name",
  "Parent",
  "OpeningBalance",
  "IsRevenue",
  "IsDeemedPositive",
  "PartyGSTIN",
  "GSTRegistrationNumber",
  "IncomeTaxNumber",
] as const;

const GROUP_FETCH = [
  "Name",
  "Parent",
  "IsRevenue",
  "AffectsGrossProfit",
] as const;

const VOUCHER_TYPE_FETCH = ["Name", "Parent", "NumberingMethod"] as const;

const VOUCHER_FETCH = [
  "Date",
  "VoucherTypeName",
  "VoucherNumber",
  "Narration",
  "PartyLedgerName",
  "Reference",
  "AllLedgerEntries.LedgerName",
  "AllLedgerEntries.Amount",
  "AllLedgerEntries.IsDeemedPositive",
] as const;

/** List of Companies — Collection + TDL form (cross-edition). */
export const listCompaniesEnvelope = (): string =>
  buildCollectionEnvelope({
    name: "List of Companies",
    type: "Company",
    fetch: COMPANY_FETCH,
  });

/** Company Info — single-company Collection. */
export const companyInfoEnvelope = (o: { company: string }): string =>
  buildCollectionEnvelope({
    name: "Company Info",
    type: "Company",
    fetch: COMPANY_FETCH,
    company: o.company,
  });

/** List of Ledgers (ledger masters). */
export const listLedgersEnvelope = (o: { company: string }): string =>
  buildCollectionEnvelope({
    name: "List of Ledgers",
    type: "Ledger",
    fetch: LEDGER_FETCH,
    company: o.company,
  });

/** List of Groups (group masters). */
export const listGroupsEnvelope = (o: { company: string }): string =>
  buildCollectionEnvelope({
    name: "List of Groups",
    type: "Group",
    fetch: GROUP_FETCH,
    company: o.company,
  });

/** List of Voucher Types. */
export const listVoucherTypesEnvelope = (o: { company: string }): string =>
  buildCollectionEnvelope({
    name: "List of Voucher Types",
    type: "VoucherType",
    fetch: VOUCHER_TYPE_FETCH,
    company: o.company,
  });

/** Day Book — Voucher collection scoped to the period. */
export const dayBookEnvelope = (o: PeriodOptions): string =>
  buildCollectionEnvelope({
    name: "Day Book",
    type: "Voucher",
    fetch: VOUCHER_FETCH,
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });

/** Trial Balance — legacy Report form (needs TDL projection on Silver — v0.5.1). */
export const trialBalanceEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Trial Balance",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
    staticVariables: { DSPSHOWGRANDTOTAL: "Yes" },
  });

/** Profit & Loss A/c — legacy Report form (Silver: v0.5.1). */
export const profitAndLossEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Profit & Loss A/c",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });

/** Balance Sheet — legacy Report form (Silver: v0.5.1). */
export const balanceSheetEnvelope = (o: PeriodOptions): string =>
  buildExportEnvelope({
    reportId: "Balance Sheet",
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });

/**
 * Sales Register — fetched as the full Voucher collection for the period.
 * The connector filters to `VoucherTypeName="Sales"` client-side because
 * cross-edition TDL FILTER syntax is brittle.
 */
export const salesRegisterEnvelope = (o: PeriodOptions): string =>
  buildCollectionEnvelope({
    name: "Sales Register",
    type: "Voucher",
    fetch: VOUCHER_FETCH,
    company: o.company,
    fromDate: o.fromDate,
    toDate: o.toDate,
  });
