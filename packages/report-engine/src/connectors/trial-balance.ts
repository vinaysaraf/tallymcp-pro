import {
  TrialBalanceRowSchema,
  type TallyDate,
  type TrialBalanceRow,
} from "@tallymcp/shared-types";
import {
  findAllObjects,
  parseTallyAmount,
  parseTallyResponse,
  trialBalanceEnvelope,
} from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Reads the `Trial Balance` report for the period.
 *
 * Expects rows under `<TBROW>` with `GROUPNAME`, optional `LEDGERNAME`,
 * `DEBIT`, `CREDIT`. Real Tally TB XML may need a TDL/post-processing layer
 * to land in this shape — calibrated during live testing.
 */
export async function getTrialBalance(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<TrialBalanceRow[]> {
  const xml = await client.post(trialBalanceEnvelope(options));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("TrialBalance", lineErrors);
  const rows = findAllObjects(raw, "TBROW");
  return rows.map(toTbRow);
}

function toTbRow(node: Record<string, unknown>): TrialBalanceRow {
  return TrialBalanceRowSchema.parse({
    groupName: String(node.GROUPNAME ?? ""),
    ledgerName: node.LEDGERNAME ? String(node.LEDGERNAME) : undefined,
    debit: parseTallyAmount(String(node.DEBIT ?? "0")),
    credit: parseTallyAmount(String(node.CREDIT ?? "0")),
  });
}
