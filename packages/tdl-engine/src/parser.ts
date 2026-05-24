import { XMLParser } from "fast-xml-parser";
import { TdlSchemaMismatchError } from "./errors.js";

export type FieldDatatype = "string" | "number" | "boolean" | "date";

export interface CatalogField {
  identifier: string;
  name: string;
  datatype: FieldDatatype;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  parseTagValue: false,
  isArray: (tagName) => tagName === "ROW" || tagName.endsWith(".LIST"),
});

/**
 * Parses a TDL response containing `<DATA><ROW><F01>...</F01><F02>...</F02></ROW></DATA>`
 * into typed objects per the supplied schema.
 *
 * The parser is **fail-loud** on schema mismatch — any ROW missing a declared
 * `<Fxx>` element triggers {@link TdlSchemaMismatchError} rather than
 * silently zero-filling. This catches `F01..Fn` schema drift across Tally
 * versions early.
 */
export function parseRows<T = Record<string, unknown>>(
  xml: string,
  schema: ReadonlyArray<CatalogField>,
  reportName: string,
): T[] {
  const tree = xmlParser.parse(xml) as Record<string, unknown>;
  const data = findData(tree);
  const rawRows = Array.isArray(data?.ROW) ? data.ROW : data?.ROW ? [data.ROW] : [];

  return (rawRows as Array<Record<string, unknown>>).map((row, index) => {
    const missing: string[] = [];
    const out: Record<string, unknown> = {};
    for (const field of schema) {
      if (!(field.identifier in row)) {
        missing.push(field.identifier);
        continue;
      }
      out[field.name] = coerce(row[field.identifier], field.datatype);
    }
    if (missing.length > 0) {
      throw new TdlSchemaMismatchError(reportName, missing, index);
    }
    return out as T;
  });
}

function findData(tree: Record<string, unknown>): { ROW?: unknown } | undefined {
  // Tally returns <ENVELOPE><BODY><DATA>...</DATA></BODY></ENVELOPE>; some
  // shapes elide ENVELOPE/BODY in the parsed object when DATA is the root.
  const envelope = tree.ENVELOPE as Record<string, unknown> | undefined;
  const body = envelope?.BODY as Record<string, unknown> | undefined;
  const data = (body?.DATA ?? tree.DATA) as { ROW?: unknown } | undefined;
  return data;
}

function coerce(value: unknown, datatype: FieldDatatype): unknown {
  // Tally serializes <F01></F01> (empty element) as either "" or undefined
  // depending on fast-xml-parser internals; normalize both to empty.
  const text =
    value === undefined || value === null
      ? ""
      : typeof value === "object" && "#text" in (value as Record<string, unknown>)
        ? String((value as Record<string, unknown>)["#text"] ?? "")
        : String(value);

  if (datatype === "string") return text;
  if (datatype === "number") return parseNumber(text);
  if (datatype === "boolean") return /^(1|true|yes)$/i.test(text.trim());
  if (datatype === "date") return text;
  return text;
}

function parseNumber(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
