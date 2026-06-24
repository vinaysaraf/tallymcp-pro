import ExcelJS from "exceljs";
import { NUMBER_FORMATS } from "./formats.js";
import {
  ROW_STYLE_KEY,
  WorkbookSpecSchema,
  type CoverSheetSpec,
  type ExtractionLogSpec,
  type RowStyle,
  type SheetSpec,
  type WorkbookSpec,
} from "./spec.js";

// ── Visual palette (ARGB) ─────────────────────────────────────────────────────
const C = {
  headerBg: "FF1F3A5F", // deep brand blue
  headerFg: "FFFFFFFF",
  band: "FFF4F7FB", // very light blue-grey zebra stripe
  section: "FFDCE6F1", // section header band
  good: "FFE2EFDA", // soft green
  goodFg: "FF2E7D32",
  bad: "FFFCE4E4", // soft red
  badFg: "FFC62828",
  info: "FFE7F0FA", // soft blue
  infoFg: "FF1F4E79",
  kpi: "FFFFF2CC", // soft amber tile
  total: "FFEDEDED",
  border: "FFBFBFBF",
} as const;

const fill = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

/** Applies per-row emphasis (see {@link RowStyle}). */
function styleRow(row: ExcelJS.Row, style: RowStyle, colCount: number): void {
  const set = (bg: string, fg?: string, opts?: { bold?: boolean; italic?: boolean }) => {
    for (let i = 1; i <= colCount; i++) {
      const cell = row.getCell(i);
      cell.fill = fill(bg);
      cell.font = { bold: opts?.bold ?? false, italic: opts?.italic ?? false, color: fg ? { argb: fg } : undefined };
    }
  };
  switch (style) {
    case "section":
      set(C.section, C.headerBg, { bold: true });
      break;
    case "kpi":
      set(C.kpi, undefined, { bold: true });
      row.getCell(1).font = { bold: true };
      break;
    case "good":
      set(C.good, C.goodFg, { bold: true });
      break;
    case "bad":
      set(C.bad, C.badFg, { bold: true });
      break;
    case "info":
      set(C.info, C.infoFg, { bold: true });
      break;
    case "muted":
      set("FFFFFFFF", "FF808080", { italic: true });
      break;
    case "total":
      set(C.total, undefined, { bold: true });
      break;
  }
}

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
  const colCount = sheet.columns.length;
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

  // Add data rows, applying per-row emphasis + zebra banding.
  let dataIdx = 0;
  for (const row of sheet.rows) {
    const r = ws.addRow(row);
    const style = (row as Record<string, unknown>)[ROW_STYLE_KEY] as RowStyle | undefined;
    if (style) {
      styleRow(r, style, colCount);
    } else {
      if (sheet.banded && dataIdx % 2 === 1) {
        for (let i = 1; i <= colCount; i++) r.getCell(i).fill = fill(C.band);
      }
      dataIdx += 1;
    }
  }

  // Optional totals row in bold.
  if (sheet.totalsRow) {
    const r = ws.addRow(sheet.totalsRow);
    styleRow(r, "total", colCount);
  }

  // Header styling — deep-blue band, white bold text, thin bottom border.
  const header = ws.getRow(1);
  for (let i = 1; i <= colCount; i++) {
    const cell = header.getCell(i);
    cell.font = { bold: true, color: { argb: C.headerFg } };
    cell.fill = fill(C.headerBg);
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: C.border } } };
  }
  header.height = 18;

  // In-cell data bars on flagged numeric columns (over the data range only).
  const lastRow = ws.rowCount;
  if (lastRow > 1) {
    sheet.columns.forEach((c, idx) => {
      if (!c.dataBar) return;
      const col = String.fromCharCode(65 + idx); // A..Z
      const opts = {
        ref: `${col}2:${col}${lastRow}`,
        rules: [
          {
            type: "dataBar",
            cfvo: [{ type: "min" }, { type: "max" }],
            color: { argb: "FF5B9BD5" },
            priority: 1,
          },
        ],
      } as unknown as Parameters<typeof ws.addConditionalFormatting>[0];
      ws.addConditionalFormatting(opts);
    });
  }

  // Freeze panes.
  if (sheet.freezeRows && sheet.freezeRows > 0) {
    ws.views = [{ state: "frozen", ySplit: sheet.freezeRows }];
  }

  // Auto-filter on the header row across the data column band.
  if (sheet.autoFilter && colCount > 0) {
    const lastCol = String.fromCharCode(64 + colCount); // A..Z up to 26 cols
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
