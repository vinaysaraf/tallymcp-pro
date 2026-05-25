import { z } from "zod";
import { TallyDateSchema } from "@tallymcp/shared-types";

export const TallyConnectionSchema = z.object({
  name: z.string().optional(),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(9000),
  type: z.enum(["local", "lan", "server"]).default("local"),
  /** Marks this connection as the default when multiple are configured. */
  default: z.boolean().optional(),
});
export type TallyConnection = z.infer<typeof TallyConnectionSchema>;

const DEFAULT_LOCAL_CONNECTION: TallyConnection = {
  host: "127.0.0.1",
  port: 9000,
  type: "local",
};

export const FinancialYearSchema = z.object({
  from: TallyDateSchema,
  to: TallyDateSchema,
});
export type FinancialYear = z.infer<typeof FinancialYearSchema>;

export const ConfigSchema = z
  .object({
    /** Bumped when the config shape changes. Used by migrations. */
    schemaVersion: z.number().int().min(1).default(1),
    tally: z
      .object({
        connections: z.array(TallyConnectionSchema).default([DEFAULT_LOCAL_CONNECTION]),
        defaultCompany: z.string().optional(),
        defaultFinancialYear: FinancialYearSchema.optional(),
        /**
         * Allows voucher / closing-balance / audit-lite tools to run even when
         * capability probe marks Tally as Silver-class. Default false: those
         * tools fail fast with a clear message on slow editions (use the file-
         * import path instead). Set true on TallyPrime 4.x Gold.
         */
        unsafeSlow: z.boolean().default(false),
        /**
         * Forces an edition assumption instead of running the capability probe
         * at boot. "auto" runs the probe. "gold" assumes voucher viable.
         * "silver" disables voucher tools without probing.
         */
        assumedEdition: z.enum(["auto", "silver", "gold"]).default("auto"),
      })
      .default({}),
    output: z
      .object({
        folder: z.string().min(1).default("./tallymcp-output"),
      })
      .default({}),
    security: z
      .object({
        /** C-R2: read-only mode is the safe default. */
        readOnly: z.boolean().default(true),
      })
      .default({}),
  })
  .default({});
export type Config = z.infer<typeof ConfigSchema>;
