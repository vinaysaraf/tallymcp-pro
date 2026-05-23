import { GroupSchema, type Group } from "@tallymcp/shared-types";
import {
  findAll,
  listGroupsEnvelope,
  parseTallyBoolean,
  parseTallyResponse,
} from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/** Reads `List of Groups` for the given company. */
export async function listGroups(
  client: TallyClient,
  options: { company: string },
): Promise<Group[]> {
  const xml = await client.post(listGroupsEnvelope({ company: options.company }));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("GroupMasters", lineErrors);
  const nodes = findAll(raw, "GROUP") as Array<Record<string, unknown>>;
  return nodes.map(toGroup);
}

function toGroup(node: Record<string, unknown>): Group {
  return GroupSchema.parse({
    name: String(node["@_NAME"] ?? node.NAME ?? ""),
    parent: node.PARENT ? String(node.PARENT) : undefined,
    isRevenue:
      node.ISREVENUE !== undefined ? parseTallyBoolean(String(node.ISREVENUE)) : undefined,
    affectsGrossProfit:
      node.AFFECTSGROSSPROFIT !== undefined
        ? parseTallyBoolean(String(node.AFFECTSGROSSPROFIT))
        : undefined,
  });
}
