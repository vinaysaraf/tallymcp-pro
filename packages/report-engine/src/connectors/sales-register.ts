import type { TallyDate, Voucher } from "@tallymcp/shared-types";
import { findAllObjects, parseTallyResponse, salesRegisterEnvelope } from "@tallymcp/tally-xml";
import type { TallyClient } from "../client.js";
import { TallyReportError } from "../errors.js";
import { toVoucher } from "../voucher-normalize.js";

/**
 * Reads the Sales Register for the period and returns voucher-level rows.
 *
 * The Tally envelope asks for the full Voucher collection in the date range
 * because cross-edition `FILTER` syntax for "VoucherTypeName = 'Sales'" is
 * brittle. We normalize every voucher and then keep only Sales-typed ones.
 */
export async function getSalesRegister(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<Voucher[]> {
  const xml = await client.post(salesRegisterEnvelope(options), { charset: "utf-8" });
  const { raw, lineErrors } = parseTallyResponse(xml);
  if (lineErrors.length) throw new TallyReportError("SalesRegister", lineErrors);
  const nodes = findAllObjects(raw, "VOUCHER");
  const all = nodes.map(toVoucher);
  return all.filter((v) => /^sales$/i.test(v.voucherType));
}
