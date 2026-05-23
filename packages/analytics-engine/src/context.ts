import type {
  Group,
  Ledger,
  TallyDate,
  TrialBalanceRow,
  Voucher,
} from "@tallymcp/shared-types";

/**
 * The audit-lite checks operate on a deterministic snapshot of the books: the
 * full voucher population for the period, the loaded masters, and the Trial
 * Balance. Streaming exports use a separate path (`exportVouchers`); audit-lite
 * needs the whole set in one place so cross-cutting checks (duplicate numbers,
 * missing-narration ratio, etc.) are correct.
 */
export interface DataQualityContext {
  company: string;
  period: { from: TallyDate; to: TallyDate };
  ledgers: readonly Ledger[];
  groups: readonly Group[];
  vouchers: readonly Voucher[];
  trialBalance: readonly TrialBalanceRow[];
  /** Money values above this absolute amount are "material". Default ₹10,000. */
  materialityThreshold?: number;
}

export const DEFAULT_MATERIALITY = 10000;
