/**
 * Minimal RFC-4180 CSV serialization with UTF-8 BOM for Excel double-click.
 *
 * - Fields are escaped only when they contain `,`, `"`, `\n`, or `\r`.
 * - Inner quotes are escaped by doubling.
 * - Rows are CRLF-terminated (Excel-friendly).
 */
export const UTF8_BOM = "﻿";
const NEEDS_QUOTE = /[",\n\r]/;

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (!NEEDS_QUOTE.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: ReadonlyArray<unknown>): string {
  return `${values.map(csvField).join(",")}\r\n`;
}
