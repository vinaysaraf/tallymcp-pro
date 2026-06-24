#!/usr/bin/env tsx
/**
 * Live end-to-end exercise of EVERY user-facing TallyMCP feature, driven through
 * the exact same service functions the MCP tool handlers call (no Claude tools,
 * no Cowork artifacts). Writes the real generated workbooks/CSVs into a sample
 * folder so the output can be inspected, and surfaces any connector/export
 * failure (e.g. the v1.0.7 `Cannot parse Tally amount: "[object Object]"` crash).
 *
 * Coverage:
 *   - The 10 standard reports  → tally_export_report_excel (+ a JSON spot-check)
 *   - Bonus: tally_export_masters, tally_export_vouchers,
 *            tally_run_audit_lite (Books Score), 3 × tally_export_dashboard
 *
 * Usage:
 *   pnpm tsx scripts/run-all-features.ts                       # auto-pick first company
 *   pnpm tsx scripts/run-all-features.ts --company "Acme Industries Pvt Ltd" --from 20220401 --to 20230331
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ReportIdSchema, type ReportId, type TallyDate } from "@tallymcp/shared-types";
import { listCompanies, runReport, getCompanyInfo } from "@tallymcp/report-engine";
import { exportReport, exportMasters, exportVouchers } from "@tallymcp/output-store";
import { createContext } from "../src/context.js";
import { runAuditLiteForCompany } from "../src/audit.js";
import { exportDashboardForCompany } from "../src/dashboards.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = "true";
  }
  return out;
}

interface Outcome {
  feature: string;
  ok: boolean;
  detail: string;
}

async function run(
  results: Outcome[],
  feature: string,
  fn: () => Promise<string>,
): Promise<void> {
  process.stdout.write(`  • ${feature.padEnd(38)} … `);
  try {
    const detail = await fn();
    results.push({ feature, ok: true, detail });
    console.log(`OK  ${detail}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ feature, ok: false, detail });
    console.log(`FAIL  ${detail}`);
  }
}

/** Derive the financial year that contains the company's books-start date. */
function fyFromStart(startingFrom?: TallyDate): { from: TallyDate; to: TallyDate } | undefined {
  if (!startingFrom || !/^\d{8}$/.test(startingFrom)) return undefined;
  const year = Number(startingFrom.slice(0, 4));
  const month = Number(startingFrom.slice(4, 6));
  const fyStartYear = month >= 4 ? year : year - 1;
  return {
    from: `${fyStartYear}0401` as TallyDate,
    to: `${fyStartYear + 1}0331` as TallyDate,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // scripts/ lives at apps/mcp-server/scripts → repo root is three up.
  const repoRoot = join(import.meta.dirname, "..", "..", "..");
  const outputDir = args.out ?? join(repoRoot, "samples", "feature-pack");
  mkdirSync(outputDir, { recursive: true });

  // Real production context, but with a sandboxed config path + the sample
  // output folder, so we never touch the user's live ~/.tallymcp/config.json.
  const ctx = await createContext({
    configPath: join(outputDir, ".sample-config.json"),
    outputDir,
  });

  console.log(
    `\n[run-all-features] Tally edition: ${ctx.capabilities.edition} | ` +
      `voucher-class viable: ${ctx.capabilities.voucherQueriesViable}`,
  );

  // ── Pick the company ───────────────────────────────────────────────
  const companies = await listCompanies(ctx.tallyClient);
  console.log(`[run-all-features] ${companies.length} company/companies loaded:`);
  for (const c of companies) console.log(`    - ${c.name}`);

  // ── Probe mode: find which company/FY actually has transaction data ─
  // Day Book is TDL-backed (fast). Prints a count grid so we can target the
  // real sample-pack run at a company+period that isn't empty.
  if (args.probe === "true") {
    const fys: Array<{ label: string; from: TallyDate; to: TallyDate }> = [
      { label: "FY26-27", from: "20260401" as TallyDate, to: "20270331" as TallyDate },
      { label: "FY25-26", from: "20250401" as TallyDate, to: "20260331" as TallyDate },
      { label: "FY24-25", from: "20240401" as TallyDate, to: "20250331" as TallyDate },
      { label: "FY23-24", from: "20230401" as TallyDate, to: "20240331" as TallyDate },
      { label: "FY22-23", from: "20220401" as TallyDate, to: "20230331" as TallyDate },
    ];
    console.log(`\n[probe] Day Book row counts per company × FY:\n`);
    console.log(`  ${"company".padEnd(50)} ${fys.map((f) => f.label.padStart(8)).join("")}`);
    for (const c of companies) {
      const counts: string[] = [];
      for (const fy of fys) {
        try {
          const r = await runReport(ctx.tallyClient, {
            reportId: "DayBook",
            company: c.name,
            fromDate: fy.from,
            toDate: fy.to,
          });
          counts.push(String(r.rows.length).padStart(8));
        } catch {
          counts.push("   err".padStart(8));
        }
      }
      console.log(`  ${c.name.slice(0, 50).padEnd(50)} ${counts.join("")}`);
    }
    console.log(`\n[probe] Re-run without --probe, passing the richest --company/--from/--to.`);
    return;
  }

  const company = args.company ?? companies[0]?.name;
  if (!company) throw new Error("No company loaded in Tally.");

  // ── Resolve the working period ─────────────────────────────────────
  let period: { from: TallyDate; to: TallyDate } | undefined;
  if (args.from && args.to) {
    period = { from: args.from as TallyDate, to: args.to as TallyDate };
  } else {
    const info = await getCompanyInfo(ctx.tallyClient, { company });
    period = fyFromStart(info.startingFrom);
  }
  console.log(
    `[run-all-features] company "${company}", period ${period ? `${period.from}–${period.to}` : "(default FY)"}\n` +
      `[run-all-features] output → ${outputDir}\n`,
  );

  const results: Outcome[] = [];

  // ── The 10 standard reports → Excel export ─────────────────────────
  console.log("STANDARD REPORTS (tally_export_report_excel):");
  const reportIds = ReportIdSchema.options as readonly ReportId[];
  for (const reportId of reportIds) {
    await run(results, `report:${reportId} (excel)`, async () => {
      const result = await runReport(ctx.tallyClient, {
        reportId,
        company: reportId === "ListOfCompanies" ? undefined : company,
        fromDate: period?.from,
        toDate: period?.to,
      });
      const file = await exportReport(result, { format: "excel", outputDir });
      return `${result.rows.length} rows → ${file.fileName}`;
    });
  }

  // JSON spot-check (same pipeline, JSON branch) on the report that crashed.
  console.log("\nJSON EXPORT spot-check (tally_export_report_json):");
  await run(results, "report:LedgerMasters (json)", async () => {
    const result = await runReport(ctx.tallyClient, { reportId: "LedgerMasters", company });
    const file = await exportReport(result, { format: "json", outputDir });
    return `${result.rows.length} rows → ${file.fileName}`;
  });

  // ── Bonus features ─────────────────────────────────────────────────
  console.log("\nBONUS FEATURES:");
  await run(results, "masters bulk export", async () => {
    const r = await exportMasters(ctx.tallyClient, { company, outputDir });
    return `→ ${r.workbook.fileName}`;
  });

  // On Silver the capability probe gates voucher-class tools off (slow
  // $ClosingBalance). --force-vouchers runs them anyway so the streaming
  // voucher path (toVoucher) and dashboard/audit exports get live coverage.
  const forceVouchers = args["force-vouchers"] === "true";
  if ((ctx.capabilities.voucherQueriesViable || forceVouchers) && period) {
    await run(results, "vouchers CSV + XLSX export", async () => {
      const files = await exportVouchers(ctx.tallyClient, {
        company,
        fromDate: period!.from,
        toDate: period!.to,
        outputDir,
      });
      return `→ ${files.csv.fileName} + ${files.xlsx.fileName}`;
    });
    await run(results, "audit-lite + Books Score", async () => {
      const r = await runAuditLiteForCompany(ctx, {
        company,
        fromDate: period!.from,
        toDate: period!.to,
      });
      return `score ${r.result.booksScore.score}/100 → ${r.workbookFile.fileName}`;
    });
    for (const kind of ["ManagementSnapshot", "SalesTrend", "ExceptionsOverview"] as const) {
      await run(results, `dashboard:${kind}`, async () => {
        const file = await exportDashboardForCompany(ctx, {
          kind,
          company,
          fromDate: period!.from,
          toDate: period!.to,
        });
        return `→ ${file.fileName}`;
      });
    }
  } else {
    console.log(
      "  (voucher-class features skipped — Tally edition not voucher-viable; " +
        "set config tally.unsafeSlow=true on Silver to force)",
    );
  }

  // ── Summary ────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n[run-all-features] ${passed}/${results.length} features passed`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ❌ ${f.feature}: ${f.detail}`);
    process.exit(1);
  }
  console.log("[run-all-features] ✅ ALL FEATURES PASS");
}

main().catch((err) => {
  console.error(`\n[run-all-features] fatal: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
