import { VoucherSchema, type Voucher } from "@tallymcp/shared-types";
import { parseTallyAmount, parseTallyBoolean } from "@tallymcp/tally-xml";

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

  const entries = entriesList.map((e) => ({
    ledger: String(e.LEDGERNAME ?? ""),
    amount: parseTallyAmount(String(e.AMOUNT ?? "0")),
    isDeemedPositive: parseTallyBoolean(String(e.ISDEEMEDPOSITIVE ?? "No")),
  }));

  return VoucherSchema.parse({
    date: String(node.DATE ?? ""),
    voucherType: String(node.VOUCHERTYPENAME ?? node["@_VCHTYPE"] ?? ""),
    voucherNumber: node.VOUCHERNUMBER ? String(node.VOUCHERNUMBER) : undefined,
    narration: node.NARRATION ? String(node.NARRATION) : undefined,
    party: node.PARTYLEDGERNAME
      ? String(node.PARTYLEDGERNAME)
      : node.PARTYNAME
        ? String(node.PARTYNAME)
        : undefined,
    reference: node.REFERENCE ? String(node.REFERENCE) : undefined,
    entries,
  });
}
