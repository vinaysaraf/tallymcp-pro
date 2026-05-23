import { XMLParser } from "fast-xml-parser";

/**
 * Parses Tally XML responses into a navigable object tree.
 *
 * Tally responses are quirky: sometimes pretty-printed, sometimes minified,
 * often missing the XML prolog, occasionally double-encoding entities, and they
 * report soft failures via `<LINEERROR>` rather than HTTP status codes.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  // Amounts and dates stay as strings until a dedicated parser handles them.
  parseTagValue: false,
});

export interface ParsedTallyResponse {
  /** The raw parsed object tree. Navigate with {@link findAll} or property access. */
  raw: unknown;
  /** Soft `<LINEERROR>` messages Tally embeds in otherwise-successful responses. */
  lineErrors: string[];
}

type Visitor = (value: unknown, key: string) => void;

/** Depth-first walk of a parsed XML tree, invoking `visit` for every keyed value. */
export function walk(node: unknown, visit: Visitor): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      visit(value, key);
      walk(value, visit);
    }
  }
}

/**
 * Collects every value stored under `tagName`, flattening repeated tags
 * (which `fast-xml-parser` represents as arrays) into a single list.
 */
export function findAll(node: unknown, tagName: string): unknown[] {
  const found: unknown[] = [];
  walk(node, (value, key) => {
    if (key !== tagName) return;
    if (Array.isArray(value)) found.push(...value);
    else found.push(value);
  });
  return found;
}

/**
 * Like {@link findAll} but keeps only object-shaped matches.
 *
 * TallyPrime's CMPINFO header contains scrap entries like `<COMPANY>0</COMPANY>`
 * (a string count) alongside the real `<COMPANY NAME="...">…</COMPANY>` objects
 * in DATA. Connectors that parse structured records should use this helper.
 */
export function findAllObjects(
  node: unknown,
  tagName: string,
): Array<Record<string, unknown>> {
  return findAll(node, tagName).filter(
    (v): v is Record<string, unknown> =>
      v !== null && typeof v === "object" && !Array.isArray(v),
  );
}

/** Extracts `<LINEERROR>` text from a parsed tree. */
export function extractLineErrors(node: unknown): string[] {
  const errors: string[] = [];
  walk(node, (value, key) => {
    if (key === "LINEERROR" && typeof value === "string") {
      errors.push(value);
    }
  });
  return errors;
}

/** Parses a Tally XML response into a navigable tree plus any soft line errors. */
export function parseTallyResponse(xml: string): ParsedTallyResponse {
  const raw: unknown = parser.parse(xml);
  return { raw, lineErrors: extractLineErrors(raw) };
}

/** Parses a Tally boolean (`"Yes"` / `"No"` style) into a real boolean. */
export const parseTallyBoolean = (value: string): boolean =>
  /^(yes|true|1)$/i.test(value?.trim() ?? "");
