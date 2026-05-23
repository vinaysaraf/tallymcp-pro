import { PnlRowSchema, type PnlRow, type TallyDate } from "@tallymcp/shared-types";
import {
  findAllObjects,
  parseTallyAmount,
  parseTallyResponse,
  profitAndLossEnvelope,
} from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Reads the raw `Profit & Loss A/c` report for the period.
 *
 * Expects rows under `<PLROW>` with `HEAD`, optional `SUBHEAD`/`LEDGER`, `AMOUNT`.
 * Real Tally P&L XML may need a TDL/post-processing layer to land in this shape —
 * calibrated during live testing.
 */
export async function getProfitAndLoss(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<PnlRow[]> {
  const xml = await client.post(profitAndLossEnvelope(options));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("ProfitAndLoss", lineErrors);
  const rows = findAllObjects(raw, "PLROW");
  return rows.map(toPlRow);
}

function toPlRow(node: Record<string, unknown>): PnlRow {
  return PnlRowSchema.parse({
    head: String(node.HEAD ?? ""),
    subHead: node.SUBHEAD ? String(node.SUBHEAD) : undefined,
    ledger: node.LEDGER ? String(node.LEDGER) : undefined,
    amount: parseTallyAmount(String(node.AMOUNT ?? "0")),
  });
}
