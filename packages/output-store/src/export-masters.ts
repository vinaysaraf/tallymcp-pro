import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderWorkbook, type SheetSpec, type WorkbookSpec } from "@tallymcp/excel-engine";
import { listGroups, listLedgers, listVoucherTypes, type TallyClient } from "@tallymcp/report-engine";
import type { GeneratedFile } from "@tallymcp/shared-types";
import { csvRow, UTF8_BOM } from "./csv.js";
import { ensureDir, generatedFileFor, MIME_CSV, MIME_XLSX, safeFileName } from "./paths.js";

export interface ExportMastersOptions {
  company: string;
  outputDir: string;
}

export interface ExportMastersResult {
  workbook: GeneratedFile;
  csvs: GeneratedFile[];
}

/**
 * Reads all masters (ledgers, groups, voucher types) and writes:
 *   - One multi-sheet `.xlsx` workbook (`<company>-masters.xlsx`)
 *   - One CSV per master, UTF-8 with BOM for Excel double-click.
 */
export async function exportMasters(
  client: TallyClient,
  options: ExportMastersOptions,
): Promise<ExportMastersResult> {
  const dir = ensureDir(options.outputDir);
  const stem = safeFileName(options.company);

  const [ledgers, groups, voucherTypes] = await Promise.all([
    listLedgers(client, { company: options.company }),
    listGroups(client, { company: options.company }),
    listVoucherTypes(client, { company: options.company }),
  ]);

  const sheets: SheetSpec[] = [
    {
      name: "Ledgers",
      columns: [
        { header: "Name", key: "name", width: 40 },
        { header: "Parent Group", key: "parent", width: 28 },
        { header: "Opening Balance", key: "openingBalance", width: 18, numberFormat: "currency-inr" },
        { header: "Revenue?", key: "isRevenue", width: 10 },
        { header: "Dr-positive?", key: "isDeemedPositive", width: 14 },
        { header: "GSTIN", key: "gstin", width: 20 },
        { header: "PAN", key: "panNumber", width: 14 },
      ],
      rows: ledgers as unknown as Array<Record<string, unknown>>,
      freezeRows: 1,
      autoFilter: true,
    },
    {
      name: "Groups",
      columns: [
        { header: "Name", key: "name", width: 40 },
        { header: "Parent", key: "parent", width: 28 },
        { header: "Revenue?", key: "isRevenue", width: 10 },
        { header: "Affects Gross Profit?", key: "affectsGrossProfit", width: 22 },
      ],
      rows: groups as unknown as Array<Record<string, unknown>>,
      freezeRows: 1,
      autoFilter: true,
    },
    {
      name: "Voucher Types",
      columns: [
        { header: "Name", key: "name", width: 32 },
        { header: "Parent", key: "parent", width: 24 },
        { header: "Numbering", key: "numberingMethod", width: 24 },
      ],
      rows: voucherTypes as unknown as Array<Record<string, unknown>>,
      freezeRows: 1,
      autoFilter: true,
    },
  ];

  const spec: WorkbookSpec = {
    filename: `${stem}-masters.xlsx`,
    cover: {
      title: "Masters",
      company: options.company,
      generatedAt: new Date().toISOString(),
    },
    sheets,
  };

  const xlsxPath = join(dir, `${stem}-masters.xlsx`);
  writeFileSync(xlsxPath, await renderWorkbook(spec));
  const workbook = generatedFileFor(xlsxPath, MIME_XLSX);

  const csvs: GeneratedFile[] = [
    writeMasterCsv(dir, `${stem}-ledgers.csv`, sheets[0]!),
    writeMasterCsv(dir, `${stem}-groups.csv`, sheets[1]!),
    writeMasterCsv(dir, `${stem}-voucher-types.csv`, sheets[2]!),
  ];

  return { workbook, csvs };
}

function writeMasterCsv(dir: string, fileName: string, sheet: SheetSpec): GeneratedFile {
  const path = join(dir, fileName);
  const lines: string[] = [UTF8_BOM];
  lines.push(csvRow(sheet.columns.map((c) => c.header)));
  for (const row of sheet.rows) {
    lines.push(csvRow(sheet.columns.map((c) => row[c.key] ?? "")));
  }
  writeFileSync(path, lines.join(""), "utf8");
  return generatedFileFor(path, MIME_CSV);
}
