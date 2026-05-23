import type { AuditLiteResult, Finding } from "@tallymcp/shared-types";
import { computeBooksScore } from "./books-score.js";
import { AUDIT_LITE_CHECKS } from "./checks.js";
import type { DataQualityContext } from "./context.js";

const AUDIT_DISCLAIMER =
  "Analytical support only — not a statutory audit opinion. Verify each finding against source records.";

/** Runs all 18 audit-lite checks and packages the result. */
export function runAuditLite(ctx: DataQualityContext): AuditLiteResult {
  const findings: Finding[] = [];
  for (const check of AUDIT_LITE_CHECKS) {
    findings.push(...check(ctx));
  }
  const summary = findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { high: 0, medium: 0, low: 0 },
  );
  const booksScore = computeBooksScore(findings);
  return {
    findings,
    summary,
    booksScore,
    generatedAt: new Date().toISOString(),
    meta: { company: ctx.company, period: ctx.period },
  };
}

/** Top-N findings ranked by severity (high → medium → low). */
export function topFindings(result: AuditLiteResult, n = 20): Finding[] {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...result.findings]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, n);
}

export { AUDIT_DISCLAIMER };
