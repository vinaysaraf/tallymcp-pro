import { LedgerSchema, type Ledger } from "@tallymcp/shared-types";
import {
  findAllObjects,
  listLedgersEnvelope,
  nodeText,
  parseTallyAmount,
  parseTallyBoolean,
  parseTallyResponse,
} from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/** Reads `List of Ledgers` for the given company. */
export async function listLedgers(
  client: TallyClient,
  options: { company: string },
): Promise<Ledger[]> {
  const xml = await client.post(listLedgersEnvelope({ company: options.company }), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("LedgerMasters", lineErrors);
  const nodes = findAllObjects(raw, "LEDGER");
  return nodes.map(toLedger);
}

function toLedger(node: Record<string, unknown>): Ledger {
  // nodeText() unwraps `#text` from attribute-carrying elements; a bare
  // String() on those yields "[object Object]" and crashes parseTallyAmount.
  const gstin = nodeText(node.PARTYGSTIN) || nodeText(node.GSTIN);
  const pan = nodeText(node.INCOMETAXNUMBER);
  return LedgerSchema.parse({
    name: nodeText(node["@_NAME"]) || nodeText(node.NAME),
    parent: nodeText(node.PARENT),
    openingBalance: parseTallyAmount(nodeText(node.OPENINGBALANCE)),
    isRevenue:
      node.ISREVENUE !== undefined ? parseTallyBoolean(nodeText(node.ISREVENUE)) : undefined,
    isDeemedPositive:
      node.ISDEEMEDPOSITIVE !== undefined
        ? parseTallyBoolean(nodeText(node.ISDEEMEDPOSITIVE))
        : undefined,
    gstin: gstin || undefined,
    panNumber: pan || undefined,
  });
}
