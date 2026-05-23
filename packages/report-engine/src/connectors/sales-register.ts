import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import { findAll, parseTallyResponse, salesRegisterEnvelope } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { toVoucher } from "../voucher-normalize.js";

/** Reads the Sales Register for the period and returns voucher-level rows. */
export async function getSalesRegister(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<Voucher[]> {
  const xml = await client.post(salesRegisterEnvelope(options));
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("SalesRegister", lineErrors);
  const nodes = findAll(raw, "VOUCHER") as Array<Record<string, unknown>>;
  return nodes.map(toVoucher);
}
