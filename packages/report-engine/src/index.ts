export type { TallyClient } from "./client.js";
export { TallyReportError } from "./errors.js";
export { resolvePeriod } from "./resolve-period.js";
export type { ResolvePeriodOptions, ResolvedPeriod } from "./resolve-period.js";
export {
  getBalanceSheet,
  getCompanyInfo,
  getDayBook,
  getProfitAndLoss,
  getSalesRegister,
  getTrialBalance,
  listCompanies,
  listGroups,
  listLedgers,
  listVoucherTypes,
  type GetDayBookOptions,
} from "./connectors/index.js";
export { runReport, type RunReportOptions } from "./run-report.js";
export { toVoucher } from "./voucher-normalize.js";
