import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderWorkbook, toWorkbookSpec } from "@tallymcp/excel-engine";
import type { GeneratedFile, ReadReportResult } from "@tallymcp/shared-types";
import { ensureDir, generatedFileFor, MIME_JSON, MIME_XLSX, safeFileName } from "./paths.js";

export interface ExportReportOptions {
  format: "excel" | "json";
  outputDir: string;
  /** Adds the audit-lite disclaimer to the cover sheet (Excel only). */
  disclaimer?: boolean;
  /** Override the default filename (without extension). */
  fileName?: string;
}

/**
 * Persists a {@link ReadReportResult} to disk as either `.xlsx` or `.json`.
 * Returns metadata describing the written file.
 */
export async function exportReport(
  result: ReadReportResult,
  options: ExportReportOptions,
): Promise<GeneratedFile> {
  const dir = ensureDir(options.outputDir);
  const stem = safeFileName(
    options.fileName ?? `${result.meta.reportId}-${result.meta.generatedAt.replace(/[:.]/g, "-")}`,
  );

  if (options.format === "excel") {
    const spec = toWorkbookSpec(result, { disclaimer: options.disclaimer });
    const buf = await renderWorkbook(spec);
    const path = join(dir, `${stem}.xlsx`);
    writeFileSync(path, buf);
    return generatedFileFor(path, MIME_XLSX);
  }

  const path = join(dir, `${stem}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return generatedFileFor(path, MIME_JSON);
}
