import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderWorkbook } from "@tallymcp/excel-engine";
import { ensureDir, generatedFileFor, MIME_XLSX } from "@tallymcp/output-store";
import {
  getDayBookStream,
  getTrialBalance,
  listGroups,
  listLedgers,
  resolvePeriod,
} from "@tallymcp/report-engine";
import {
  runAuditLite,
  toAuditWorkbook,
  topFindings,
  type DataQualityContext,
} from "@tallymcp/analytics-engine";
import type {
  AuditLiteResult,
  GeneratedFile,
  TallyDate,
  Voucher,
} from "@tallymcp/shared-types";
import type { McpContext } from "./context.js";

const AUDIT_JSON_NAME = "audit-result.json";

export interface RunAuditLiteOptions {
  company: string;
  fromDate?: TallyDate;
  toDate?: TallyDate;
}

export interface RunAuditLiteResponse {
  result: AuditLiteResult;
  topFindings: ReturnType<typeof topFindings>;
  workbookPath: string;
  auditResultPath: string;
  workbookFile: GeneratedFile;
}

/**
 * MCP-side wiring for `tally_run_audit_lite`: reads masters + full-period
 * vouchers + Trial Balance, runs the 18 checks via analytics-engine, persists
 * `audit-result.json`, renders the Excel workbook, and returns paths + inline
 * findings JSON.
 */
export async function runAuditLiteForCompany(
  ctx: McpContext,
  options: RunAuditLiteOptions,
): Promise<RunAuditLiteResponse> {
  // 1. Resolve the period — pull starting-from from CompanyInfo if no override.
  const period = resolvePeriod(undefined, {
    fromDate: options.fromDate,
    toDate: options.toDate,
    defaultFinancialYear: ctx.config.tally.defaultFinancialYear,
  });

  // 2. Fetch masters + TB in parallel.
  const [ledgers, groups, trialBalance] = await Promise.all([
    listLedgers(ctx.tallyClient, { company: options.company }),
    listGroups(ctx.tallyClient, { company: options.company }),
    getTrialBalance(ctx.tallyClient, {
      company: options.company,
      fromDate: period.from,
      toDate: period.to,
    }),
  ]);

  // 3. Pull full-period vouchers via the streaming Day Book — collected here
  //    for cross-cutting checks (duplicate-number, ratio). Fixture-scale.
  const vouchers: Voucher[] = [];
  for await (const chunk of getDayBookStream(ctx.tallyClient, {
    company: options.company,
    fromDate: period.from,
    toDate: period.to,
  })) {
    for (const v of chunk) vouchers.push(v);
  }

  // 4. Run the 18 checks.
  const dqContext: DataQualityContext = {
    company: options.company,
    period,
    ledgers,
    groups,
    vouchers,
    trialBalance,
  };
  const result = runAuditLite(dqContext);

  // 5. Persist audit-result.json + render workbook.
  const dir = ensureDir(ctx.outputDir);
  const auditResultPath = join(dir, AUDIT_JSON_NAME);
  writeFileSync(auditResultPath, JSON.stringify(result, null, 2), "utf8");

  const spec = toAuditWorkbook(result);
  const workbookPath = join(dir, spec.filename);
  writeFileSync(workbookPath, await renderWorkbook(spec));
  const workbookFile = generatedFileFor(workbookPath, MIME_XLSX);

  return {
    result,
    topFindings: topFindings(result, 20),
    workbookPath,
    auditResultPath,
    workbookFile,
  };
}

/** Reads the most recently persisted `audit-result.json`, or returns an empty placeholder. */
export async function readLastAuditResult(ctx: McpContext): Promise<string> {
  const dir = ctx.outputDir;
  const path = join(dir, AUDIT_JSON_NAME);
  if (!existsSync(path)) {
    return JSON.stringify(
      {
        status: "no-audit-yet",
        message:
          "No audit-lite result has been generated yet. Run `tally_run_audit_lite` first.",
      },
      null,
      2,
    );
  }
  return readFileSync(path, "utf8");
}
