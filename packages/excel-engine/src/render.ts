import ExcelJS from "exceljs";
import { NUMBER_FORMATS } from "./formats.js";
import {
  WorkbookSpecSchema,
  type CoverSheetSpec,
  type ExtractionLogSpec,
  type SheetSpec,
  type WorkbookSpec,
} from "./spec.js";

/**
 * Renders a {@link WorkbookSpec} into an `.xlsx` byte buffer.
 *
 * Sheet order: optional Cover → data sheets (in declared order) → optional
 * Extraction Log. Number formats are applied per column. Sheets with
 * `freezeRows` get a frozen-header view; sheets with `autoFilter: true` get a
 * filter row across the column band.
 */
export async function renderWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const parsed = WorkbookSpecSchema.parse(spec);
  const wb = new ExcelJS.Workbook();
  wb.creator = "TallyMCP Pro";
  wb.created = new Date();

  if (parsed.cover) addCoverSheet(wb, parsed.cover);
  for (const sheet of parsed.sheets) addDataSheet(wb, sheet);
  if (parsed.extractionLog) addExtractionLogSheet(wb, parsed.extractionLog);

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

function addCoverSheet(wb: ExcelJS.Workbook, cover: CoverSheetSpec): void {
  const ws = wb.addWorksheet("Cover");
  ws.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 60 },
  ];

  const rows: Array<{ field: string; value: string }> = [
    { field: "Report", value: cover.title },
  ];
  if (cover.company) rows.push({ field: "Company", value: cover.company });
  if (cover.period) {
    rows.push({ field: "Period (from)", value: cover.period.from });
    rows.push({ field: "Period (to)", value: cover.period.to });
  }
  rows.push({ field: "Generated at", value: cover.generatedAt });
  if (cover.extra) {
    for (const [k, v] of Object.entries(cover.extra)) rows.push({ field: k, value: v });
  }
  if (cover.disclaimer) {
    rows.push({ field: "Disclaimer", value: cover.disclaimer });
  }
  ws.addRows(rows);

  // Header row bold.
  ws.getRow(1).font = { bold: true };
  // Disclaimer cell wraps and is visually distinct.
  if (cover.disclaimer) {
    const last = ws.lastRow;
    if (last) {
      last.font = { italic: true };
      last.alignment = { wrapText: true, vertical: "top" };
    }
  }
}

function addDataSheet(wb: ExcelJS.Workbook, sheet: SheetSpec): void {
  const ws = wb.addWorksheet(sheet.name);
  ws.columns = sheet.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 16,
  }));

  // Apply number formats per column.
  for (const c of sheet.columns) {
    if (c.numberFormat) {
      ws.getColumn(c.key).numFmt = NUMBER_FORMATS[c.numberFormat];
    }
  }

  // Add data rows.
  for (const row of sheet.rows) ws.addRow(row);

  // Optional totals row in bold.
  if (sheet.totalsRow) {
    const r = ws.addRow(sheet.totalsRow);
    r.font = { bold: true };
  }

  // Header styling.
  ws.getRow(1).font = { bold: true };

  // Freeze panes.
  if (sheet.freezeRows && sheet.freezeRows > 0) {
    ws.views = [{ state: "frozen", ySplit: sheet.freezeRows }];
  }

  // Auto-filter on the header row across the data column band.
  if (sheet.autoFilter && sheet.columns.length > 0) {
    const lastCol = String.fromCharCode(64 + sheet.columns.length); // A..Z up to 26 cols
    ws.autoFilter = { from: "A1", to: `${lastCol}1` };
  }
}

function addExtractionLogSheet(wb: ExcelJS.Workbook, log: ExtractionLogSpec): void {
  const ws = wb.addWorksheet("Extraction Log");
  ws.columns = [
    { header: "Timestamp", key: "at", width: 26 },
    { header: "Step", key: "step", width: 30 },
    { header: "Detail", key: "detail", width: 80 },
  ];
  ws.addRows(log.entries.map((e) => ({ at: e.at, step: e.step, detail: e.detail ?? "" })));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
