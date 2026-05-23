import { z } from "zod";

export const CompanyIdSchema = z.string().min(1);
export type CompanyId = z.infer<typeof CompanyIdSchema>;

export const TallyDateSchema = z
  .string()
  .regex(/^\d{8}$/, "Tally date must be YYYYMMDD");
export type TallyDate = z.infer<typeof TallyDateSchema>;

export const CompanySchema = z.object({
  id: CompanyIdSchema,
  name: z.string(),
  startingFrom: TallyDateSchema,
  booksFrom: TallyDateSchema.optional(),
  baseCurrency: z.string().default("INR"),
  gstin: z.string().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

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
