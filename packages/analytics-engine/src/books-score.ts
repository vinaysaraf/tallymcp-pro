import type { BooksScore, Finding } from "@tallymcp/shared-types";

const SEVERITY_PENALTY = { high: 10, medium: 4, low: 1 } as const;

/**
 * Computes an explainable 0–100 books-readiness score from audit-lite findings.
 *
 * Start at 100, deduct per finding by severity, group identical codes into
 * one component for readability. Never goes below 0.
 */
export function computeBooksScore(findings: ReadonlyArray<Finding>): BooksScore {
  const byCode = new Map<string, { count: number; severity: Finding["severity"] }>();
  for (const f of findings) {
    const entry = byCode.get(f.code) ?? { count: 0, severity: f.severity };
    entry.count += 1;
    byCode.set(f.code, entry);
  }

  const components = [...byCode.entries()].map(([code, { count, severity }]) => {
    const penalty = SEVERITY_PENALTY[severity] * count;
    return {
      category: code,
      delta: -penalty,
      reason: `${count} × ${severity} findings under ${code}`,
    };
  });

  const totalPenalty = components.reduce((sum, c) => sum + c.delta, 0); // sum of negatives
  const score = Math.max(0, Math.min(100, 100 + totalPenalty));

  return {
    score,
    components,
    generatedAt: new Date().toISOString(),
  };
}
