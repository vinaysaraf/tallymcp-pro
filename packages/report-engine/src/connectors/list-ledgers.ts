import { LedgerSchema, type Ledger } from "@tallymcp/shared-types";
import {
  findAllObjects,
  listLedgersEnvelope,
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
  const xml = await client.post(listLedgersEnvelope({ company: options.company }));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("LedgerMasters", lineErrors);
  const nodes = findAllObjects(raw, "LEDGER");
  return nodes.map(toLedger);
}

function toLedger(node: Record<string, unknown>): Ledger {
  const gstinSource = node.PARTYGSTIN ?? node.GSTIN;
  return LedgerSchema.parse({
    name: String(node["@_NAME"] ?? node.NAME ?? ""),
    parent: String(node.PARENT ?? ""),
    openingBalance: parseTallyAmount(String(node.OPENINGBALANCE ?? "")),
    isRevenue:
      node.ISREVENUE !== undefined ? parseTallyBoolean(String(node.ISREVENUE)) : undefined,
    isDeemedPositive:
      node.ISDEEMEDPOSITIVE !== undefined
        ? parseTallyBoolean(String(node.ISDEEMEDPOSITIVE))
        : undefined,
    gstin: gstinSource ? String(gstinSource) : undefined,
    panNumber: node.INCOMETAXNUMBER ? String(node.INCOMETAXNUMBER) : undefined,
  });
}
