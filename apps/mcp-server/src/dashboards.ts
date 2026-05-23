import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildExceptionsOverview,
  buildManagementSnapshot,
  buildSalesTrend,
  type DashboardKind,
} from "@tallymcp/analytics-engine";
import { renderWorkbook } from "@tallymcp/excel-engine";
import { ensureDir, generatedFileFor, MIME_XLSX } from "@tallymcp/output-store";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getSalesRegister,
  getTrialBalance,
  resolvePeriod,
} from "@tallymcp/report-engine";
import type {
  AuditLiteResult,
  GeneratedFile,
  TallyDate,
} from "@tallymcp/shared-types";
import type { McpContext } from "./context.js";

export interface ExportDashboardOptions {
  kind: DashboardKind;
  company: string;
  fromDate?: TallyDate;
  toDate?: TallyDate;
}

/** Renders one of the 3 in-scope dashboards to disk and returns its metadata. */
export async function exportDashboardForCompany(
  ctx: McpContext,
  options: ExportDashboardOptions,
): Promise<GeneratedFile> {
  const period = resolvePeriod(undefined, {
    fromDate: options.fromDate,
    toDate: options.toDate,
    defaultFinancialYear: ctx.config.tally.defaultFinancialYear,
  });
  const dir = ensureDir(ctx.outputDir);
  const generatedAt = new Date().toISOString();

  let spec;
  if (options.kind === "ManagementSnapshot") {
    const [trialBalance, profitAndLoss, balanceSheet] = await Promise.all([
      getTrialBalance(ctx.tallyClient, {
        company: options.company,
        fromDate: period.from,
        toDate: period.to,
      }),
      getProfitAndLoss(ctx.tallyClient, {
        company: options.company,
        fromDate: period.from,
        toDate: period.to,
      }),
      getBalanceSheet(ctx.tallyClient, {
        company: options.company,
        fromDate: period.from,
        toDate: period.to,
      }).catch(() => undefined), // BS sometimes missing on partial datasets — soft-fail
    ]);
    spec = buildManagementSnapshot({
      company: options.company,
      period,
      generatedAt,
      trialBalance,
      profitAndLoss,
      balanceSheet,
    });
  } else if (options.kind === "SalesTrend") {
    const salesVouchers = await getSalesRegister(ctx.tallyClient, {
      company: options.company,
      fromDate: period.from,
      toDate: period.to,
    });
    spec = buildSalesTrend({
      company: options.company,
      period,
      generatedAt,
      salesVouchers,
    });
  } else {
    const auditPath = join(dir, "audit-result.json");
    if (!existsSync(auditPath)) {
      throw new Error(
        "ExceptionsOverview requires an existing audit-result.json — run `tally_run_audit_lite` first.",
      );
    }
    const audit: AuditLiteResult = JSON.parse(readFileSync(auditPath, "utf8"));
    spec = buildExceptionsOverview({
      company: options.company,
      period,
      generatedAt,
      audit,
    });
  }

  const path = join(dir, spec.filename);
  writeFileSync(path, await renderWorkbook(spec));
  return generatedFileFor(path, MIME_XLSX);
}
