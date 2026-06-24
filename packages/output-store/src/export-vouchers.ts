import { createWriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDayBookStream, type TallyClient } from "@tallymcp/report-engine";
import { renderWorkbook, type WorkbookSpec } from "@tallymcp/excel-engine";
import type { GeneratedFile, TallyDate } from "@tallymcp/shared-types";
import { csvRow, UTF8_BOM } from "./csv.js";
import { ensureDir, generatedFileFor, MIME_CSV, MIME_XLSX, safeFileName } from "./paths.js";

export interface ExportVouchersOptions {
  company: string;
  fromDate: TallyDate;
  toDate: TallyDate;
  outputDir: string;
  /** Day-Book window size; defaults to 7. */
  chunkDays?: number;
}

/** Both outputs: a streaming CSV and a formatted Excel workbook. */
export interface ExportVouchersResult {
  csv: GeneratedFile;
  xlsx: GeneratedFile;
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
 * Exports the Day Book as one row per ledger entry, in two formats:
 *  - a **CSV** written by streaming each {@link getDayBookStream} chunk (the
 *    full FY is never held in memory) — UTF-8 BOM so Excel opens it directly;
 *  - a **formatted .xlsx** (styled header, in-cell data bars, banded rows) with
 *    a by-voucher-type Summary sheet. The xlsx necessarily buffers the rows
 *    (ExcelJS builds in memory), so the CSV remains the memory-safe path.
 */
export async function exportVouchers(
  client: TallyClient,
  options: ExportVouchersOptions,
): Promise<ExportVouchersResult> {
  const dir = ensureDir(options.outputDir);
  const stem = `${safeFileName(options.company)}-vouchers-${options.fromDate}-${options.toDate}`;
  const csvPath = join(dir, `${stem}.csv`);
  const xlsxPath = join(dir, `${stem}.xlsx`);

  const stream = createWriteStream(csvPath, { encoding: "utf8" });
  const flushClose = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      stream.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()));
    });

  // Buffered for the .xlsx; the CSV is written as we go.
  const rows: Array<Record<string, unknown>> = [];
  const byType = new Map<string, { type: string; vouchers: number; entries: number; value: number }>();

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
        const slot =
          byType.get(voucher.voucherType) ??
          { type: voucher.voucherType, vouchers: 0, entries: 0, value: 0 };
        slot.vouchers += 1;
        // Voucher value ≈ sum of positive (credit-side) entries.
        slot.value += voucher.entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
        for (const entry of voucher.entries) {
          slot.entries += 1;
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
          rows.push({
            date: voucher.date,
            voucherType: voucher.voucherType,
            voucherNumber: voucher.voucherNumber ?? "",
            party: voucher.party ?? "",
            reference: voucher.reference ?? "",
            narration: voucher.narration ?? "",
            ledger: entry.ledger,
            amount: entry.amount,
            isDeemedPositive: entry.isDeemedPositive ? "Yes" : "No",
          });
        }
        byType.set(voucher.voucherType, slot);
      }
    }
  } finally {
    await flushClose();
  }

  const summary = [...byType.values()].sort((a, b) => b.value - a.value);
  const totalVouchers = summary.reduce((a, s) => a + s.vouchers, 0);
  const totalEntries = summary.reduce((a, s) => a + s.entries, 0);
  const totalValue = summary.reduce((a, s) => a + s.value, 0);

  const spec: WorkbookSpec = {
    filename: `${stem}.xlsx`,
    cover: {
      title: "Vouchers",
      company: options.company,
      period: { from: options.fromDate, to: options.toDate },
      generatedAt: new Date().toISOString(),
      extra: { Vouchers: String(totalVouchers), "Ledger entries": String(totalEntries) },
    },
    sheets: [
      {
        name: "Summary by Type",
        columns: [
          { header: "Voucher Type", key: "type", width: 24 },
          { header: "# Vouchers", key: "vouchers", width: 14, numberFormat: "integer" },
          { header: "# Entries", key: "entries", width: 12, numberFormat: "integer" },
          { header: "Value (Rs.)", key: "value", width: 20, numberFormat: "currency-inr", dataBar: true },
        ],
        rows: summary as unknown as Array<Record<string, unknown>>,
        totalsRow: { type: "TOTAL", vouchers: totalVouchers, entries: totalEntries, value: totalValue },
        freezeRows: 1,
        banded: true,
      },
      {
        name: "Vouchers",
        columns: [
          { header: "Date", key: "date", width: 12 },
          { header: "Type", key: "voucherType", width: 18 },
          { header: "Number", key: "voucherNumber", width: 14 },
          { header: "Party", key: "party", width: 28 },
          { header: "Reference", key: "reference", width: 16 },
          { header: "Narration", key: "narration", width: 44 },
          { header: "Ledger", key: "ledger", width: 28 },
          { header: "Amount", key: "amount", width: 18, numberFormat: "currency-inr-negative-red", dataBar: true },
          { header: "Dr?", key: "isDeemedPositive", width: 8 },
        ],
        rows,
        freezeRows: 1,
        autoFilter: true,
        banded: true,
      },
    ],
  };
  writeFileSync(xlsxPath, await renderWorkbook(spec));

  return {
    csv: generatedFileFor(csvPath, MIME_CSV),
    xlsx: generatedFileFor(xlsxPath, MIME_XLSX),
  };
}
