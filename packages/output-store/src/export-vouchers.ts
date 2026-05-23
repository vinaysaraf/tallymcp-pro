import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { getDayBookStream, type TallyClient } from "@tallymcp/report-engine";
import type { GeneratedFile, TallyDate } from "@tallymcp/shared-types";
import { csvRow, UTF8_BOM } from "./csv.js";
import { ensureDir, generatedFileFor, MIME_CSV, safeFileName } from "./paths.js";

export interface ExportVouchersOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
  outputDir: string;
  /** Day-Book window size; defaults to 7. */
  chunkDays?: number;
}

const HEADER = [
  "Date",
  "Voucher Type",
  "Voucher Number",
  "Party",
  "Reference",
  "Narration",
  "Ledger",
  "Amount",
  "Is Deemed Positive",
] as const;

/**
 * Streams the Day Book to a single CSV, flattened to one row per ledger entry.
 * Each chunk yielded by {@link getDayBookStream} is written and discarded —
 * the full FY voucher set is never held in memory at once.
 *
 * The CSV begins with the UTF-8 BOM so Excel opens it directly without an
 * encoding prompt.
 */
export async function exportVouchers(
  client: TallyClient,
  options: ExportVouchersOptions,
): Promise<GeneratedFile> {
  const dir = ensureDir(options.outputDir);
  const fileName = `${safeFileName(options.company)}-vouchers-${options.fromDate}-${options.toDate}.csv`;
  const path = join(dir, fileName);

  const stream = createWriteStream(path, { encoding: "utf8" });
  const flushClose = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      stream.end((err: NodeJS.ErrnoException | null | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });

  try {
    stream.write(UTF8_BOM);
    stream.write(csvRow(HEADER));

    for await (const chunk of getDayBookStream(client, {
      company: options.company,
      fromDate: options.fromDate,
      toDate: options.toDate,
      chunkDays: options.chunkDays,
    })) {
      for (const voucher of chunk) {
        for (const entry of voucher.entries) {
          stream.write(
            csvRow([
              voucher.date,
              voucher.voucherType,
              voucher.voucherNumber ?? "",
              voucher.party ?? "",
              voucher.reference ?? "",
              voucher.narration ?? "",
              entry.ledger,
              entry.amount,
              entry.isDeemedPositive ? "Yes" : "No",
            ]),
          );
        }
      }
    }
  } finally {
    await flushClose();
  }

  return generatedFileFor(path, MIME_CSV);
}
