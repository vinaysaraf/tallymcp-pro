import type { ReportId } from "@tallymcp/shared-types";

export interface ReportDescriptor {
  reportId: ReportId;
  tallyReportName: string;
  description: string;
  /** Whether the report requires a `fromDate` / `toDate` range. */
  needsPeriod: boolean;
  /** Whether the report requires `company` (everything except `ListOfCompanies`). */
  needsCompany: boolean;
}

export const REPORT_DESCRIPTORS: readonly ReportDescriptor[] = Object.freeze([
  {
    reportId: "ListOfCompanies",
    tallyReportName: "List of Companies",
    description: "All companies known to Tally on this connection.",
    needsPeriod: false,
    needsCompany: false,
  },
  {
    reportId: "CompanyInfo",
    tallyReportName: "Company Info",
    description: "Metadata for the loaded company (FY start, currency, GSTIN).",
    needsPeriod: false,
    needsCompany: true,
  },
  {
    reportId: "LedgerMasters",
    tallyReportName: "List of Ledgers",
    description: "All ledger masters with parent group, opening balance, GSTIN, PAN.",
    needsPeriod: false,
    needsCompany: true,
  },
  {
    reportId: "GroupMasters",
    tallyReportName: "List of Groups",
    description: "All account groups.",
    needsPeriod: false,
    needsCompany: true,
  },
  {
    reportId: "VoucherTypes",
    tallyReportName: "List of Voucher Types",
    description: "All voucher types and numbering methods.",
    needsPeriod: false,
    needsCompany: true,
  },
  {
    reportId: "DayBook",
    tallyReportName: "Day Book",
    description: "All vouchers in the period (chunked in 7-day windows).",
    needsPeriod: true,
    needsCompany: true,
  },
  {
    reportId: "TrialBalance",
    tallyReportName: "Trial Balance",
    description: "Trial Balance with closing debit/credit by group and ledger.",
    needsPeriod: true,
    needsCompany: true,
  },
  {
    reportId: "ProfitAndLoss",
    tallyReportName: "Profit & Loss A/c",
    description: "Raw Tally Profit & Loss for the period.",
    needsPeriod: true,
    needsCompany: true,
  },
  {
    reportId: "BalanceSheet",
    tallyReportName: "Balance Sheet",
    description: "Raw Tally Balance Sheet as on the to-date.",
    needsPeriod: true,
    needsCompany: true,
  },
  {
    reportId: "SalesRegister",
    tallyReportName: "Sales Register",
    description: "Sales vouchers in the period.",
    needsPeriod: true,
    needsCompany: true,
  },
]);
