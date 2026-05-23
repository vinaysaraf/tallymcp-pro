import { z } from "zod";

// ---------- Primitives ----------

export const CompanyIdSchema = z.string().min(1);
export type CompanyId = z.infer<typeof CompanyIdSchema>;

export const TallyDateSchema = z
  .string()
  .regex(/^\d{8}$/, "Tally date must be YYYYMMDD");
export type TallyDate = z.infer<typeof TallyDateSchema>;

// ---------- Company ----------

export const CompanySchema = z.object({
  id: CompanyIdSchema,
  name: z.string(),
  /** Older TallyPrime editions (Silver) sometimes return only the company name. */
  startingFrom: TallyDateSchema.optional(),
  booksFrom: TallyDateSchema.optional(),
  baseCurrency: z.string().default("INR"),
  gstin: z.string().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

// ---------- Masters ----------

export const LedgerSchema = z.object({
  name: z.string(),
  parent: z.string(),
  openingBalance: z.number().default(0),
  isRevenue: z.boolean().optional(),
  isDeemedPositive: z.boolean().optional(),
  gstin: z.string().optional(),
  panNumber: z.string().optional(),
});
export type Ledger = z.infer<typeof LedgerSchema>;

export const GroupSchema = z.object({
  name: z.string(),
  parent: z.string().optional(),
  isRevenue: z.boolean().optional(),
  affectsGrossProfit: z.boolean().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

export const VoucherTypeSchema = z.object({
  name: z.string(),
  parent: z.string(),
  numberingMethod: z
    .enum(["Manual", "Automatic", "Auto (Manual Override)", "MultiUser Auto"])
    .optional(),
});
export type VoucherType = z.infer<typeof VoucherTypeSchema>;

// ---------- Voucher ----------

export const VoucherLineSchema = z.object({
  ledger: z.string().min(1),
  amount: z.number(),
  isDeemedPositive: z.boolean(),
});
export type VoucherLine = z.infer<typeof VoucherLineSchema>;

export const VoucherSchema = z.object({
  date: TallyDateSchema,
  voucherType: z.string().min(1),
  voucherNumber: z.string().optional(),
  narration: z.string().optional(),
  party: z.string().optional(),
  reference: z.string().optional(),
  entries: z.array(VoucherLineSchema).min(1),
});
export type Voucher = z.infer<typeof VoucherSchema>;

// ---------- Report rows ----------

export const TrialBalanceRowSchema = z.object({
  groupName: z.string().min(1),
  ledgerName: z.string().optional(),
  debit: z.number(),
  credit: z.number(),
});
export type TrialBalanceRow = z.infer<typeof TrialBalanceRowSchema>;

export const PnlRowSchema = z.object({
  head: z.string().min(1),
  subHead: z.string().optional(),
  ledger: z.string().optional(),
  amount: z.number(),
});
export type PnlRow = z.infer<typeof PnlRowSchema>;

export const BalanceSheetRowSchema = z.object({
  side: z.enum(["Assets", "Liabilities"]),
  group: z.string().min(1),
  subGroup: z.string().optional(),
  ledger: z.string().optional(),
  amount: z.number(),
});
export type BalanceSheetRow = z.infer<typeof BalanceSheetRowSchema>;

// ---------- Report request / result ----------

export const ReportIdSchema = z.enum([
  "CompanyInfo",
  "ListOfCompanies",
  "LedgerMasters",
  "GroupMasters",
  "VoucherTypes",
  "DayBook",
  "TrialBalance",
  "ProfitAndLoss",
  "BalanceSheet",
  "SalesRegister",
]);
export type ReportId = z.infer<typeof ReportIdSchema>;

export const ReportFormatSchema = z.enum(["json", "excel"]);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

export const ReadReportRequestSchema = z.object({
  reportId: ReportIdSchema,
  company: z.string().optional(),
  fromDate: TallyDateSchema.optional(),
  toDate: TallyDateSchema.optional(),
  format: ReportFormatSchema.optional(),
});
export type ReadReportRequest = z.infer<typeof ReadReportRequestSchema>;

export const ReportStatusSchema = z.enum(["ok", "error"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportMetaSchema = z.object({
  reportId: z.string().min(1),
  company: z.string().optional(),
  period: z
    .object({ from: TallyDateSchema, to: TallyDateSchema })
    .optional(),
  generatedAt: z.string().min(1),
});
export type ReportMeta = z.infer<typeof ReportMetaSchema>;

/**
 * Generic Tally report result. `rows` is loosely typed at the schema layer; each
 * connector validates rows against its own row schema before returning.
 */
export const ReadReportResultSchema = z.object({
  status: ReportStatusSchema,
  meta: ReportMetaSchema,
  rows: z.array(z.unknown()),
  warnings: z.array(z.string()),
  lineErrors: z.array(z.string()),
});
export type ReadReportResult<TRow = unknown> = Omit<
  z.infer<typeof ReadReportResultSchema>,
  "rows"
> & { rows: TRow[] };

// ---------- Analytics / audit ----------

export const FindingSeveritySchema = z.enum(["high", "medium", "low"]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingSchema = z.object({
  code: z.string().min(1),
  severity: FindingSeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: z.array(z.string()),
  suggestedFix: z.string().min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

// ---------- Books score + audit-lite result ----------

export const BooksScoreComponentSchema = z.object({
  category: z.string().min(1),
  /** Negative value = penalty deducted from the headline score. */
  delta: z.number(),
  reason: z.string().min(1),
});
export type BooksScoreComponent = z.infer<typeof BooksScoreComponentSchema>;

export const BooksScoreSchema = z.object({
  score: z.number().min(0).max(100),
  components: z.array(BooksScoreComponentSchema),
  generatedAt: z.string().min(1),
});
export type BooksScore = z.infer<typeof BooksScoreSchema>;

export const AuditLiteSummarySchema = z.object({
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type AuditLiteSummary = z.infer<typeof AuditLiteSummarySchema>;

export const AuditLiteResultSchema = z.object({
  findings: z.array(FindingSchema),
  summary: AuditLiteSummarySchema,
  booksScore: BooksScoreSchema,
  generatedAt: z.string().min(1),
  meta: z.object({
    company: z.string().min(1),
    period: z.object({ from: TallyDateSchema, to: TallyDateSchema }),
  }),
});
export type AuditLiteResult = z.infer<typeof AuditLiteResultSchema>;

// ---------- Generated files ----------

export const GeneratedFileSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
});
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
