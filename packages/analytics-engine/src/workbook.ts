import type { WorkbookSpec } from "@tallymcp/excel-engine";
import type { AuditLiteResult } from "@tallymcp/shared-types";
import { AUDIT_DISCLAIMER } from "./run-audit-lite.js";

/** Turns an `AuditLiteResult` into a `WorkbookSpec` (cover + Findings + Score). */
export function toAuditWorkbook(result: AuditLiteResult): WorkbookSpec {
  return {
    filename: `audit-lite-${result.meta.company.replace(/[^a-zA-Z0-9._-]+/g, "_")}-${result.meta.period.from}-${result.meta.period.to}.xlsx`,
    cover: {
      title: "Audit-lite",
      company: result.meta.company,
      period: result.meta.period,
      generatedAt: result.generatedAt,
      disclaimer: AUDIT_DISCLAIMER,
      extra: {
        "Books score": `${result.booksScore.score} / 100`,
        "High-severity findings": String(result.summary.high),
        "Medium-severity findings": String(result.summary.medium),
        "Low-severity findings": String(result.summary.low),
      },
    },
    sheets: [
      {
        name: "Findings",
        columns: [
          { header: "Code", key: "code", width: 36 },
          { header: "Severity", key: "severity", width: 12 },
          { header: "Title", key: "title", width: 40 },
          { header: "Description", key: "description", width: 60 },
          { header: "Evidence", key: "evidence", width: 50 },
          { header: "Suggested Fix", key: "suggestedFix", width: 50 },
        ],
        rows: result.findings.map((f) => ({
          ...f,
          evidence: f.evidence.join(" | "),
        })),
        freezeRows: 1,
        autoFilter: true,
      },
      {
        name: "Books Score",
        columns: [
          { header: "Category", key: "category", width: 36 },
          { header: "Delta", key: "delta", width: 12 },
          { header: "Reason", key: "reason", width: 60 },
        ],
        rows: result.booksScore.components.map((c) => ({ ...c })),
        totalsRow: {
          category: "TOTAL",
          delta: result.booksScore.score - 100,
          reason: `Final books score: ${result.booksScore.score} / 100`,
        },
        freezeRows: 1,
      },
    ],
  };
}
