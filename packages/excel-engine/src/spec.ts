import { z } from "zod";

const NumberFormatSchema = z.enum([
  "currency-inr",
  "currency-inr-negative-red",
  "integer",
  "percent-2",
  "date-dd-mm-yyyy",
  "text",
]);
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

export const ColumnSpecSchema = z.object({
  header: z.string().min(1),
  /** Property name on the row object. */
  key: z.string().min(1),
  /** Approximate column width in Excel's font-width units. */
  width: z.number().int().positive().optional(),
  numberFormat: NumberFormatSchema.optional(),
});
export type ColumnSpec = z.infer<typeof ColumnSpecSchema>;

export const SheetSpecSchema = z.object({
  /** Excel limits sheet names to 31 characters and forbids `:\\/?*[]`. */
  name: z
    .string()
    .min(1)
    .max(31)
    .refine((s) => !/[\\/?*[\]:]/.test(s), {
      message: "Sheet name must not contain : \\ / ? * [ ]",
    }),
  columns: z.array(ColumnSpecSchema).min(1),
  rows: z.array(z.record(z.string(), z.unknown())),
  freezeRows: z.number().int().min(0).optional(),
  autoFilter: z.boolean().optional(),
  /** Optional totals row appended after data, rendered in bold. */
  totalsRow: z.record(z.string(), z.unknown()).optional(),
});
export type SheetSpec = z.infer<typeof SheetSpecSchema>;

export const CoverSheetSpecSchema = z.object({
  title: z.string().min(1),
  company: z.string().optional(),
  period: z
    .object({ from: z.string(), to: z.string() })
    .optional(),
  generatedAt: z.string().min(1),
  disclaimer: z.string().optional(),
  /** Extra key/value rows shown under the standard fields. */
  extra: z.record(z.string(), z.string()).optional(),
});
export type CoverSheetSpec = z.infer<typeof CoverSheetSpecSchema>;

export const ExtractionLogSpecSchema = z.object({
  /** Each row records one step (Tally request, parsed N rows, warnings). */
  entries: z.array(
    z.object({
      at: z.string().min(1),
      step: z.string().min(1),
      detail: z.string().optional(),
    }),
  ),
});
export type ExtractionLogSpec = z.infer<typeof ExtractionLogSpecSchema>;

export const WorkbookSpecSchema = z.object({
  /** Suggested filename (without path). */
  filename: z.string().min(1),
  cover: CoverSheetSpecSchema.optional(),
  extractionLog: ExtractionLogSpecSchema.optional(),
  sheets: z.array(SheetSpecSchema).min(1),
});
export type WorkbookSpec = z.infer<typeof WorkbookSpecSchema>;
