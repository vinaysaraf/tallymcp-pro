import {
  ReadReportRequestSchema,
  type ReadReportRequest,
  type ReadReportResult,
  type ReportMeta,
  type TallyDate,
} from "@tallymcp/shared-types";
import type { TallyClient } from "./client.js";
import {
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
} from "./connectors/index.js";
import { TallyReportError } from "./errors.js";
import { resolvePeriod } from "./resolve-period.js";

/**
 * Orchestrator that turns a {@link ReadReportRequest} into a
 * {@link ReadReportResult}. Resolves the FY for period-dependent reports,
 * dispatches to the right connector, and wraps the rows in a uniform envelope.
 */
export interface RunReportOptions {
  /** Company metadata used for FY resolution. */
  company?: { startingFrom: TallyDate };
  /** Default FY (from config) — overrides the asOf-based computation. */
  defaultFinancialYear?: { from: TallyDate; to: TallyDate };
  /** Reference date for "current FY"; defaults to `new Date()`. */
  asOf?: Date;
}

const PERIOD_REPORTS = new Set<ReadReportRequest["reportId"]>([
  "DayBook",
  "TrialBalance",
  "ProfitAndLoss",
  "BalanceSheet",
  "SalesRegister",
]);

export async function runReport(
  client: TallyClient,
  request: ReadReportRequest,
  options: RunReportOptions = {},
): Promise<ReadReportResult> {
  const validated = ReadReportRequestSchema.parse(request);
  const generatedAt = new Date().toISOString();
  const baseMeta: ReportMeta = {
    reportId: validated.reportId,
    company: validated.company,
    generatedAt,
  };

  if (
    validated.reportId !== "ListOfCompanies" &&
    !validated.company
  ) {
    throw new TallyReportError(validated.reportId, ["company is required"]);
  }

  switch (validated.reportId) {
    case "ListOfCompanies": {
      const rows = await listCompanies(client);
      return ok(baseMeta, rows);
    }
    case "CompanyInfo": {
      const row = await getCompanyInfo(client, { company: validated.company! });
      return ok(baseMeta, [row]);
    }
    case "LedgerMasters": {
      const rows = await listLedgers(client, { company: validated.company! });
      return ok(baseMeta, rows);
    }
    case "GroupMasters": {
      const rows = await listGroups(client, { company: validated.company! });
      return ok(baseMeta, rows);
    }
    case "VoucherTypes": {
      const rows = await listVoucherTypes(client, { company: validated.company! });
      return ok(baseMeta, rows);
    }
  }

  if (PERIOD_REPORTS.has(validated.reportId)) {
    const period = resolvePeriod(options.company, {
      fromDate: validated.fromDate,
      toDate: validated.toDate,
      defaultFinancialYear: options.defaultFinancialYear,
      asOf: options.asOf,
    });
    const periodOpts = {
      company: validated.company!,
      fromDate: period.from,
      toDate: period.to,
    };
    const meta: ReportMeta = { ...baseMeta, period: { from: period.from, to: period.to } };

    switch (validated.reportId) {
      case "DayBook":
        return ok(meta, await getDayBook(client, periodOpts));
      case "TrialBalance":
        return ok(meta, await getTrialBalance(client, periodOpts));
      case "ProfitAndLoss":
        return ok(meta, await getProfitAndLoss(client, periodOpts));
      case "BalanceSheet":
        return ok(meta, await getBalanceSheet(client, periodOpts));
      case "SalesRegister":
        return ok(meta, await getSalesRegister(client, periodOpts));
    }
  }

  // Exhaustiveness — should never reach here because reportId is a Zod enum.
  throw new TallyReportError(validated.reportId, ["unsupported reportId"]);
}

function ok<TRow>(meta: ReportMeta, rows: TRow[]): ReadReportResult<TRow> {
  return { status: "ok", meta, rows, warnings: [], lineErrors: [] };
}
