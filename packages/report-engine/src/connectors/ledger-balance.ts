import { z } from "zod";
import { buildCollectionEnvelope, findAllObjects, parseTallyAmount, parseTallyResponse } from "@tallymcp/tally-xml";
import type { TallyDate } from "@tallymcp/shared-types";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";

/**
 * Closing balance for a single named ledger over a period.
 *
 * Uses a name-filtered `Ledger` collection with `ClosingBalance` projection.
 * Designed for the "sales figure" question: pass the Sales ledger (or any
 * single ledger) and get the closing Dr/Cr in one round-trip.
 *
 * Works fast on TallyPrime 4.x. On TallyPrime Silver against busy datasets
 * (thousands of ledgers, lakhs of vouchers) Tally evaluates `$ClosingBalance`
 * before the filter, so the request can take minutes or time out. The MCP
 * server defaults its `headersTimeoutMs` to 60 s and `timeoutMs` to 120 s;
 * for Silver we recommend bumping these further or upgrading to TallyPrime 4.x.
 */
export const LedgerClosingBalanceSchema = z.object({
  ledger: z.string().min(1),
  parent: z.string().min(1),
  /** Net amount in INR. Positive = debit-side close, negative = credit-side close. */
  closing: z.number(),
});
export type LedgerClosingBalance = z.infer<typeof LedgerClosingBalanceSchema>;

export interface GetLedgerClosingBalanceOptions {
  company: string;
  /** Exact ledger name as it appears in Tally. */
  ledger: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

export async function getLedgerClosingBalance(
  client: TallyClient,
  options: GetLedgerClosingBalanceOptions,
): Promise<LedgerClosingBalance> {
  const xml = await client.post(
    buildCollectionEnvelope({
      name: "One Ledger Closing",
      type: "Ledger",
      fetch: ["Name", "Parent", "ClosingBalance"],
      company: options.company,
      fromDate: options.fromDate,
      toDate: options.toDate,
    }),
  );
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("LedgerClosingBalance", lineErrors);

  const nodes = findAllObjects(raw, "LEDGER");
  // Client-side name match (cross-edition; FILTER on $Name is brittle on Silver).
  const norm = (s: string): string => s.trim().toLowerCase();
  const match = nodes.find(
    (n) => norm(String(n["@_NAME"] ?? n.NAME ?? "")) === norm(options.ledger),
  );
  if (!match) {
    throw new TallyReportError("LedgerClosingBalance", [
      `Ledger "${options.ledger}" not found in the response (${nodes.length} ledgers scanned).`,
    ]);
  }

  return LedgerClosingBalanceSchema.parse({
    ledger: String(match["@_NAME"] ?? match.NAME ?? options.ledger),
    parent: String(match.PARENT ?? ""),
    closing: parseTallyAmount(String(match.CLOSINGBALANCE ?? "0")),
  });
}

/**
 * Sums closing balances across every ledger whose `Parent` (group) matches
 * `groupName`. Useful for the "sales figure" question: group="Sales Accounts".
 *
 * Caveat (Silver): if Tally fails to honor a $Parent filter and returns the
 * full ledger set, the closing-balance projection over thousands of ledgers
 * times out. On TallyPrime 4.x this is well within seconds for typical books.
 */
export interface GetGroupClosingBalanceOptions {
  company: string;
  groupName: string;
  fromDate: TallyDate;
  toDate: TallyDate;
}

export interface GroupClosingBalance {
  groupName: string;
  ledgerCount: number;
  totalClosing: number;
  ledgers: LedgerClosingBalance[];
}

export async function getGroupClosingBalances(
  client: TallyClient,
  options: GetGroupClosingBalanceOptions,
): Promise<GroupClosingBalance> {
  const xml = await client.post(
    buildCollectionEnvelope({
      name: "Group Ledgers Closing",
      type: "Ledger",
      fetch: ["Name", "Parent", "ClosingBalance"],
      company: options.company,
      fromDate: options.fromDate,
      toDate: options.toDate,
    }),
  );
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("GroupClosingBalance", lineErrors);

  const nodes = findAllObjects(raw, "LEDGER");
  const norm = (s: string): string => s.trim().toLowerCase();
  const target = norm(options.groupName);
  const matched = nodes.filter((n) => norm(String(n.PARENT ?? "")) === target);

  const ledgers = matched.map((n) =>
    LedgerClosingBalanceSchema.parse({
      ledger: String(n["@_NAME"] ?? n.NAME ?? ""),
      parent: String(n.PARENT ?? ""),
      closing: parseTallyAmount(String(n.CLOSINGBALANCE ?? "0")),
    }),
  );
  const totalClosing = ledgers.reduce((a, l) => a + l.closing, 0);

  return {
    groupName: options.groupName,
    ledgerCount: ledgers.length,
    totalClosing,
    ledgers,
  };
}
