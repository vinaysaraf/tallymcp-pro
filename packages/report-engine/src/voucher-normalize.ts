import { VoucherSchema, type Voucher } from "@tallymcp/shared-types";
import { nodeText, parseTallyAmount, parseTallyBoolean } from "@tallymcp/tally-xml";

/**
 * Converts a parsed `<VOUCHER>` node (from fast-xml-parser output) into the
 * normalized {@link Voucher} domain type. Shared by Day Book and Sales Register.
 *
 * Tally's voucher XML wraps entries under `<ALLLEDGERENTRIES.LIST>`; the dot is
 * a literal part of the tag name and fast-xml-parser preserves it as the object
 * key. Repeated entries are collapsed to an array by the parser.
 */
export function toVoucher(node: Record<string, unknown>): Voucher {
  const entriesRaw = node["ALLLEDGERENTRIES.LIST"] ?? node.ALLLEDGERENTRIES;
  const entriesList: Array<Record<string, unknown>> = Array.isArray(entriesRaw)
    ? (entriesRaw as Array<Record<string, unknown>>)
    : entriesRaw
      ? [entriesRaw as Record<string, unknown>]
      : [];

  // nodeText() unwraps `#text` from attribute-carrying elements; a bare
  // String() on those yields "[object Object]" and crashes parseTallyAmount.
  const entries = entriesList.map((e) => ({
    ledger: nodeText(e.LEDGERNAME),
    amount: parseTallyAmount(nodeText(e.AMOUNT) || "0"),
    isDeemedPositive: parseTallyBoolean(nodeText(e.ISDEEMEDPOSITIVE) || "No"),
  }));

  const party = nodeText(node.PARTYLEDGERNAME) || nodeText(node.PARTYNAME);
  return VoucherSchema.parse({
    date: nodeText(node.DATE),
    voucherType: nodeText(node.VOUCHERTYPENAME) || nodeText(node["@_VCHTYPE"]),
    voucherNumber: nodeText(node.VOUCHERNUMBER) || undefined,
    narration: nodeText(node.NARRATION) || undefined,
    party: party || undefined,
    reference: nodeText(node.REFERENCE) || undefined,
    entries,
  });
}
