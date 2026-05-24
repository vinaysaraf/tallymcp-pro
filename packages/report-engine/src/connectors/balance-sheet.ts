import {
  BalanceSheetRowSchema,
  type BalanceSheetRow,
  type TallyDate,
} from "@tallymcp/shared-types";
import {
  balanceSheetEnvelope,
  findAllObjects,
  parseTallyAmount,
  parseTallyResponse,
} from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Reads the raw `Balance Sheet` for the period.
 *
 * Expects rows under `<BSROW>` with `SIDE` ("Assets"|"Liabilities"), `GROUP`,
 * optional `SUBGROUP`/`LEDGER`, `AMOUNT`. Real Tally BS XML may need a TDL/
 * post-processing layer to land in this shape — calibrated during live testing.
 */
export async function getBalanceSheet(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<BalanceSheetRow[]> {
  const xml = await client.post(balanceSheetEnvelope(options), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("BalanceSheet", lineErrors);
  const rows = findAllObjects(raw, "BSROW");
  return rows.map(toBsRow);
}

function toBsRow(node: Record<string, unknown>): BalanceSheetRow {
  return BalanceSheetRowSchema.parse({
    side: String(node.SIDE ?? ""),
    group: String(node.GROUP ?? ""),
    subGroup: node.SUBGROUP ? String(node.SUBGROUP) : undefined,
    ledger: node.LEDGER ? String(node.LEDGER) : undefined,
    amount: parseTallyAmount(String(node.AMOUNT ?? "0")),
  });
}
