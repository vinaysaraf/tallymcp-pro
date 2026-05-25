import { GroupSchema, type Group } from "@tallymcp/shared-types";
import {
  findAllObjects,
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
  const xml = await client.post(listGroupsEnvelope({ company: options.company }), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("GroupMasters", lineErrors);
  const nodes = findAllObjects(raw, "GROUP");
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
