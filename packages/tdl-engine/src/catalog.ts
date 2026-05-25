import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TdlEngineError } from "./errors.js";
import type { CatalogField } from "./parser.js";

const FieldDatatypeSchema = z.enum(["string", "number", "boolean", "date"]);

const InputParamSchema = z.object({
  name: z.string().min(1),
  datatype: z.enum(["string", "number", "boolean", "date"]),
  required: z.boolean().optional(),
});

const FieldSchema = z.object({
  identifier: z.string().regex(/^F\d+$/, "field identifier must match F\\d+"),
  name: z.string().min(1),
  datatype: FieldDatatypeSchema,
});

const ReportSchema = z.object({
  name: z.string().min(1),
  template: z.string().min(1),
  input: z.array(InputParamSchema),
  output: z.object({
    datatype: z.literal("array"),
    fields: z.array(FieldSchema).min(1),
  }),
});

export const CatalogSchema = z.object({
  reports: z.array(ReportSchema).min(1),
});

export type CatalogReport = z.infer<typeof ReportSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

const packageDir = dirname(fileURLToPath(import.meta.url));
const defaultCatalogPath = join(packageDir, "..", "report-catalog.json");
const defaultTemplateDir = join(packageDir, "..", "templates");

let cachedCatalog: Catalog | undefined;

/** Returns the loaded and validated `report-catalog.json`. */
export function loadCatalog(path: string = defaultCatalogPath): Catalog {
  if (cachedCatalog && path === defaultCatalogPath) return cachedCatalog;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const parsed = CatalogSchema.parse(raw);
  if (path === defaultCatalogPath) cachedCatalog = parsed;
  return parsed;
}

/** Looks up a single report by `name`. Throws if not found. */
export function getReport(name: string, catalog: Catalog = loadCatalog()): CatalogReport {
  const report = catalog.reports.find((r) => r.name === name);
  if (!report) {
    throw new TdlEngineError(`Report "${name}" not found in report-catalog.json`);
  }
  return report;
}

/** Reads the template file referenced by a report definition. */
export function loadTemplate(
  report: CatalogReport,
  templateDir: string = defaultTemplateDir,
): string {
  return readFileSync(join(templateDir, report.template), "utf8");
}

export type { CatalogField };
