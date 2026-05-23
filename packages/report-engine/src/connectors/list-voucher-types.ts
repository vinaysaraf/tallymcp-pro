import { VoucherTypeSchema, type VoucherType } from "@tallymcp/shared-types";
import { findAllObjects, listVoucherTypesEnvelope, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

const KNOWN_NUMBERING = new Set([
  "Manual",
  "Automatic",
  "Auto (Manual Override)",
  "MultiUser Auto",
]);

/** Reads `List of Voucher Types` for the given company. */
export async function listVoucherTypes(
  client: TallyClient,
  options: { company: string },
): Promise<VoucherType[]> {
  const xml = await client.post(listVoucherTypesEnvelope({ company: options.company }));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("VoucherTypes", lineErrors);
  const nodes = findAllObjects(raw, "VOUCHERTYPE");
  return nodes.map(toVoucherType);
}

function toVoucherType(node: Record<string, unknown>): VoucherType {
  const raw = node.NUMBERINGMETHOD ? String(node.NUMBERINGMETHOD) : undefined;
  const numberingMethod = raw && KNOWN_NUMBERING.has(raw) ? raw : undefined;
  return VoucherTypeSchema.parse({
    name: String(node["@_NAME"] ?? node.NAME ?? ""),
    parent: String(node.PARENT ?? ""),
    numberingMethod,
  });
}
