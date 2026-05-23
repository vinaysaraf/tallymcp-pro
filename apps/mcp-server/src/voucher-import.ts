import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { findAllObjects, parseTallyResponse } from "@tallymcp/tally-xml";
import { toVoucher } from "@tallymcp/report-engine";
import { VoucherSchema, type Voucher } from "@tallymcp/shared-types";

/**
 * File-import fallback for vouchers — the Silver-class workaround.
 *
 * Workflow:
 *   1. In TallyPrime UI: open the Day Book / Sales Register for the period.
 *   2. E: Export → Format XML → save to a file.
 *   3. Point this tool at that file; the MCP parses every <VOUCHER> node
 *      through the same `toVoucher` normalizer used by the live readers.
 *
 * Also accepts a plain JSON array of `Voucher` objects for tooling that has
 * already parsed Tally output (e.g., a previous MCP run that cached results).
 */
export async function importVouchersFromFile(filePath: string): Promise<Voucher[]> {
  const ext = extname(filePath).toLowerCase();
  const text = readFileSync(filePath, "utf8");

  if (ext === ".json") {
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) {
      throw new Error(
        `JSON voucher import: expected a top-level array, got ${typeof raw}.`,
      );
    }
    return raw.map((v) => VoucherSchema.parse(v));
  }

  if (ext !== ".xml") {
    throw new Error(
      `Unsupported voucher-import extension '${ext}'. Use .xml (Tally export) or .json.`,
    );
  }

  const { raw, lineErrors } = parseTallyResponse(text);
  if (lineErrors.length) {
    throw new Error(
      `Tally voucher XML contains ${lineErrors.length} line error(s): ${lineErrors.join("; ")}`,
    );
  }
  const nodes = findAllObjects(raw, "VOUCHER");
  if (nodes.length === 0) {
    throw new Error(
      "No <VOUCHER> elements found in the file. Ensure you exported as XML from Display → Day Book (or Sales Register).",
    );
  }
  return nodes.map(toVoucher);
}
