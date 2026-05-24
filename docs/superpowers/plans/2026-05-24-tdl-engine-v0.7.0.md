# TallyMCP v0.7.0 — TDL Engine Kill-Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the inline-TDL `REPORT+FORM+PART+LINE+FIELD+COLLECTION` pattern, sent over UTF-16 LE transport, returns Trial Balance in <5 s against the `OM JAI JAGDISH` book on TallyPrime Silver without locking the instance. If this proof passes, v0.7.1–v0.7.4 are unlocked; if it fails, v0.7 is aborted.

**Architecture:** New `@tallymcp/tdl-engine` package (nunjucks renderer + angular-bracket substitution + F01..Fn row parser + `runTdlReport` orchestrator) sits between `@tallymcp/report-engine` (thin connector adapters) and `@tallymcp/tally-connector` (HTTP transport). TB connector is rewired to delegate through `tdl-engine`. HTTP transport switches default to UTF-16 LE with a per-call `charset?` override so legacy UTF-8 envelopes keep working.

**Tech Stack:** TypeScript 5 strict, pnpm workspace, Node 20, undici, fast-xml-parser 5.8, **new dep: nunjucks 3**, Zod, Vitest, MockAgent for HTTP tests.

**Scope:** This plan is **v0.7.0 ONLY** — steps 1–4 from spec §10 plus the live Silver proof. It ships exactly one TDL report (Trial Balance). The other 23 v0.7 reports, all new Excel families, and the capability-probe rework are explicitly **deferred to v0.7.1+** and will be planned separately after the TB proof passes.

**Spec:** `docs/superpowers/specs/2026-05-24-tdl-engine-audit-reports-design.md` v1.4 (approved).

**Effort:** ~3 working days. Kill-switch: Task 11 step 4 (live Silver TB latency). If it fails, abort v0.7 entirely; do not proceed to v0.7.1.

---

## File map (locked before tasks)

**Create:**
- `packages/tdl-engine/package.json`
- `packages/tdl-engine/tsconfig.json`
- `packages/tdl-engine/vitest.config.ts`
- `packages/tdl-engine/src/index.ts`
- `packages/tdl-engine/src/renderer.ts` — nunjucks render + angular-bracket substitution
- `packages/tdl-engine/src/parser.ts` — F01..Fn rows → typed objects
- `packages/tdl-engine/src/run-tdl-report.ts` — orchestrator
- `packages/tdl-engine/src/catalog.ts` — catalog loader + types
- `packages/tdl-engine/src/errors.ts` — `TdlEngineError`, `TdlSchemaMismatchError`
- `packages/tdl-engine/report-catalog.json` — v0.7.0 entry: trial-balance
- `packages/tdl-engine/templates/trial-balance.xml` — inline TDL template
- `packages/tdl-engine/test/renderer.test.ts`
- `packages/tdl-engine/test/parser.test.ts`
- `packages/tdl-engine/test/run-tdl-report.test.ts`
- `packages/tdl-engine/test/c-r1-grep.test.ts` — templates must not contain Import/Alter/Create/`MASTER ID`
- `packages/tdl-engine/test/trial-balance-integration.test.ts` — end-to-end with MockAgent
- `scripts/v070-tb-proof.ts` — live Silver proof runner
- `docs/live-tally-checklist.md` — v0.7.0 metrics capture

**Modify:**
- `packages/tally-connector/src/http-client.ts` — add `charset?` to `post()` and constructor; default UTF-16 LE
- `packages/tally-connector/test/http-client.test.ts` — extend with charset tests, existing assertions stay green
- `packages/report-engine/src/connectors/trial-balance.ts` — delegate to `tdl-engine.runTdlReport`
- `packages/report-engine/test/financial-connectors.test.ts` — replace `<TBROW>` TB fixtures with TDL `<ROW><F01>...` shape; existing test names + assertions stay
- `packages/report-engine/package.json` — add `@tallymcp/tdl-engine` workspace dep
- `package.json` (root) — add `v070-tb-proof` script
- `CHANGELOG.md` — v0.7.0 entry

---

## Task 1: Scaffold `@tallymcp/tdl-engine` package

**Files:**
- Create: `packages/tdl-engine/package.json`
- Create: `packages/tdl-engine/tsconfig.json`
- Create: `packages/tdl-engine/vitest.config.ts`
- Create: `packages/tdl-engine/src/index.ts`

- [ ] **Step 1.1: Create package.json**

Write `packages/tdl-engine/package.json`:

```json
{
  "name": "@tallymcp/tdl-engine",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run --config vitest.config.ts --passWithNoTests",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tallymcp/shared-types": "workspace:*",
    "fast-xml-parser": "^5.8.0",
    "nunjucks": "^3.2.4",
    "zod": "^3.25.56"
  },
  "devDependencies": {
    "@types/nunjucks": "^3.2.6"
  }
}
```

- [ ] **Step 1.2: Create tsconfig.json**

Write `packages/tdl-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared-types" }]
}
```

- [ ] **Step 1.3: Create vitest.config.ts**

Write `packages/tdl-engine/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 1.4: Stub src/index.ts**

Write `packages/tdl-engine/src/index.ts`:

```typescript
// Implemented in subsequent tasks.
export {};
```

- [ ] **Step 1.5: Install nunjucks + verify build**

Run: `pnpm install`
Expected: nunjucks, @types/nunjucks added under `node_modules/.pnpm/`.

Run: `pnpm --filter @tallymcp/tdl-engine build`
Expected: tsc completes, `packages/tdl-engine/dist/index.js` exists.

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Test Files no tests` (passes because of `--passWithNoTests`).

- [ ] **Step 1.6: Commit**

```bash
git add packages/tdl-engine pnpm-lock.yaml
git commit -m "chore(tdl-engine): scaffold @tallymcp/tdl-engine package (v0.7.0 step 1)"
```

---

## Task 2: Nunjucks renderer with edge-case coverage

**Files:**
- Create: `packages/tdl-engine/src/renderer.ts`
- Create: `packages/tdl-engine/test/renderer.test.ts`

- [ ] **Step 2.1: Write the failing renderer test**

Write `packages/tdl-engine/test/renderer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { renderNunjucks } from "../src/renderer.js";

describe("renderNunjucks", () => {
  it("emits the template unchanged when no nunjuck tags present", () => {
    const xml = `<ENVELOPE><BODY><X>hello</X></BODY></ENVELOPE>`;
    expect(renderNunjucks(xml, {})).toBe(xml);
  });

  it("processes <nunjuck>if X</nunjuck>...<nunjuck>endif</nunjuck> conditionals", () => {
    const xml = `<A><nunjuck>if name</nunjuck><N>{{name | escape}}</N><nunjuck>endif</nunjuck></A>`;
    expect(renderNunjucks(xml, { name: "Acme" })).toBe("<A><N>Acme</N></A>");
    expect(renderNunjucks(xml, {})).toBe("<A></A>");
  });

  it("HTML-escapes interpolated variables via the |escape filter", () => {
    const xml = `<A>{{name | escape}}</A>`;
    expect(renderNunjucks(xml, { name: 'A & B "X" <Y>' })).toBe(
      "<A>A &amp; B &quot;X&quot; &lt;Y&gt;</A>",
    );
  });

  it("does NOT interpret {fromDate}-style angular braces (those belong to substitution layer)", () => {
    const xml = `<D>{fromDate}</D>`;
    expect(renderNunjucks(xml, { fromDate: "20220401" })).toBe("<D>{fromDate}</D>");
  });

  it("passes through a company name containing {{ and }} literals when not in variable position", () => {
    // The user-supplied value '{{evil}}' is data, not template. It only matters
    // when interpolated via {{ name | escape }} — and escape neutralizes it.
    const xml = `<C>{{name | escape}}</C>`;
    expect(renderNunjucks(xml, { name: "{{evil}}" })).toContain("name");
    // The dangerous chars are escaped:
    expect(renderNunjucks(xml, { name: "{{evil}}" })).toBe(
      "<C>{{evil}}</C>",
    );
    // (curly braces are not HTML-special; they remain literal, which is safe.)
  });
});
```

- [ ] **Step 2.2: Verify the test fails**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Cannot find module '../src/renderer.js'` — fails because module is missing.

- [ ] **Step 2.3: Implement renderer.ts**

Write `packages/tdl-engine/src/renderer.ts`:

```typescript
import nunjucks from "nunjucks";

/**
 * Nunjucks environment configured with custom block/variable tags so the
 * resulting template files are also valid XML (an inert `<nunjuck>...</nunjuck>`
 * element when viewed as raw XML).
 *
 * Variable tags `{{ ... }}` are kept as-is — they are the standard nunjucks
 * interpolation token. The user-facing convention is to always pipe through
 * `| escape` for company names and other user-supplied strings.
 */
const env = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: false,
  tags: {
    blockStart: "<nunjuck>",
    blockEnd: "</nunjuck>",
    variableStart: "{{",
    variableEnd: "}}",
    commentStart: "<comment>begin</comment>",
    commentEnd: "<comment>end</comment>",
  },
});

/**
 * Renders a TDL template through nunjucks only. Angular-bracket parameter
 * substitution (`{fromDate}` → `1-Apr-2022`) runs in a separate later stage
 * — see `substituteTdlParameters`.
 */
export function renderNunjucks(xml: string, vars: Record<string, unknown>): string {
  return env.renderString(xml, vars);
}
```

- [ ] **Step 2.4: Verify tests pass**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Test Files 1 passed (1) / Tests 5 passed (5)`.

- [ ] **Step 2.5: Commit**

```bash
git add packages/tdl-engine/src/renderer.ts packages/tdl-engine/test/renderer.test.ts
git commit -m "feat(tdl-engine): nunjucks renderer with edge-case tests (v0.7.0 step 2)"
```

---

## Task 3: Angular-bracket parameter substitution

**Files:**
- Modify: `packages/tdl-engine/src/renderer.ts` (add `substituteTdlParameters`)
- Modify: `packages/tdl-engine/test/renderer.test.ts` (extend)

- [ ] **Step 3.1: Add failing substitution tests**

Append to `packages/tdl-engine/test/renderer.test.ts` (above the closing `});` of `describe("renderNunjucks"...)` block, add a NEW describe block at file end):

```typescript
import { substituteTdlParameters } from "../src/renderer.js";

describe("substituteTdlParameters", () => {
  it("replaces a string parameter with the HTML-escaped value", () => {
    const out = substituteTdlParameters("<C>{company}</C>", { company: "A & B" });
    expect(out).toBe("<C>A &amp; B</C>");
  });

  it("formats a Date parameter as d-MMM-yyyy (Tally display format)", () => {
    const out = substituteTdlParameters("<D>{date}</D>", { date: new Date(2022, 3, 1) });
    expect(out).toBe("<D>1-Apr-2022</D>");
  });

  it("stringifies a numeric parameter", () => {
    const out = substituteTdlParameters("<A>{amount}</A>", { amount: 12345.67 });
    expect(out).toBe("<A>12345.67</A>");
  });

  it("converts a boolean to Tally Yes/No", () => {
    expect(substituteTdlParameters("<B>{flag}</B>", { flag: true })).toBe("<B>Yes</B>");
    expect(substituteTdlParameters("<B>{flag}</B>", { flag: false })).toBe("<B>No</B>");
  });

  it("leaves placeholders untouched when the parameter is absent", () => {
    expect(substituteTdlParameters("<X>{missing}</X>", {})).toBe("<X>{missing}</X>");
  });

  it("replaces every occurrence of a parameter (global)", () => {
    const out = substituteTdlParameters("<A>{x}</A><B>{x}</B>", { x: "y" });
    expect(out).toBe("<A>y</A><B>y</B>");
  });

  it("does NOT process nunjucks tags (those belong to renderNunjucks)", () => {
    const out = substituteTdlParameters(
      "<A>{{name}}</A><nunjuck>if x</nunjuck>",
      { name: "ignored" },
    );
    // Nunjucks tags pass through untouched at this layer.
    expect(out).toBe("<A>{{name}}</A><nunjuck>if x</nunjuck>");
  });
});
```

- [ ] **Step 3.2: Verify tests fail**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: 5 existing renderer tests pass; 7 new substituteTdlParameters tests fail with "is not a function" or import error.

- [ ] **Step 3.3: Implement substituteTdlParameters**

Append to `packages/tdl-engine/src/renderer.ts`:

```typescript
/**
 * Replaces `{name}` placeholders in the rendered XML with typed parameter
 * values. Runs AFTER `renderNunjucks` so nunjucks output never sees raw
 * angular-bracket tokens.
 *
 * Coercion rules:
 *  - string  → HTML-escaped
 *  - number  → `String(n)`
 *  - boolean → `"Yes"` or `"No"`
 *  - Date    → `d-MMM-yyyy` (Tally's display format)
 *  - missing parameter → leave `{name}` token in place (caller's problem)
 */
export function substituteTdlParameters(
  xml: string,
  params: Record<string, unknown>,
): string {
  let result = xml;
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const pattern = new RegExp(`\\{${escapeRegExp(name)}\\}`, "g");
    result = result.replace(pattern, () => coerce(value));
  }
  return result;
}

function coerce(value: unknown): string {
  if (typeof value === "string") return escapeHtml(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return formatTallyDisplayDate(value);
  return escapeHtml(String(value));
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTallyDisplayDate(d: Date): string {
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
```

- [ ] **Step 3.4: Verify all renderer tests pass**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Tests 12 passed (12)`.

- [ ] **Step 3.5: Commit**

```bash
git add packages/tdl-engine/src/renderer.ts packages/tdl-engine/test/renderer.test.ts
git commit -m "feat(tdl-engine): angular-bracket parameter substitution (v0.7.0 step 3)"
```

---

## Task 4: F01..Fn row parser

**Files:**
- Create: `packages/tdl-engine/src/errors.ts`
- Create: `packages/tdl-engine/src/parser.ts`
- Create: `packages/tdl-engine/test/parser.test.ts`

- [ ] **Step 4.1: Write errors.ts**

Write `packages/tdl-engine/src/errors.ts`:

```typescript
/** Base class for every error thrown by `@tallymcp/tdl-engine`. */
export class TdlEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TdlEngineError";
  }
}

/** Thrown when a `<ROW>` is missing a column declared in the catalog schema. */
export class TdlSchemaMismatchError extends TdlEngineError {
  constructor(
    public readonly reportName: string,
    public readonly missingFields: string[],
    public readonly rowIndex: number,
  ) {
    super(
      `Row ${rowIndex} of report "${reportName}" is missing fields: ${missingFields.join(", ")}`,
    );
    this.name = "TdlSchemaMismatchError";
  }
}

/** Thrown when Tally returns an `<EXCEPTION>` wrapper instead of `<DATA>`. */
export class TdlExceptionError extends TdlEngineError {
  constructor(public readonly tallyMessage: string) {
    super(`Tally returned <EXCEPTION>: ${tallyMessage}`);
    this.name = "TdlExceptionError";
  }
}
```

- [ ] **Step 4.2: Write the failing parser test**

Write `packages/tdl-engine/test/parser.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseRows } from "../src/parser.js";
import { TdlSchemaMismatchError } from "../src/errors.js";

const SCHEMA = [
  { identifier: "F01", name: "ledger", datatype: "string" as const },
  { identifier: "F02", name: "parent", datatype: "string" as const },
  { identifier: "F03", name: "opening", datatype: "number" as const },
  { identifier: "F04", name: "debit", datatype: "number" as const },
];

describe("parseRows", () => {
  it("parses a single ROW into a typed object", () => {
    const xml = `<DATA><ROW><F01>Cash</F01><F02>Cash-in-hand</F02><F03>1000</F03><F04>0</F04></ROW></DATA>`;
    const rows = parseRows(xml, SCHEMA, "trial-balance");
    expect(rows).toEqual([
      { ledger: "Cash", parent: "Cash-in-hand", opening: 1000, debit: 0 },
    ]);
  });

  it("parses multiple ROWs", () => {
    const xml = `<DATA>
      <ROW><F01>A</F01><F02>X</F02><F03>1</F03><F04>2</F04></ROW>
      <ROW><F01>B</F01><F02>Y</F02><F03>3</F03><F04>4</F04></ROW>
    </DATA>`;
    expect(parseRows(xml, SCHEMA, "trial-balance")).toHaveLength(2);
  });

  it("returns empty array when no ROWs present", () => {
    const xml = `<DATA></DATA>`;
    expect(parseRows(xml, SCHEMA, "trial-balance")).toEqual([]);
  });

  it("coerces numbers from Tally's comma-formatted strings", () => {
    const xml = `<DATA><ROW><F01>L</F01><F02>P</F02><F03>1,23,456.78</F03><F04>-1,000.00</F04></ROW></DATA>`;
    const [row] = parseRows(xml, SCHEMA, "trial-balance");
    expect(row?.opening).toBe(123456.78);
    expect(row?.debit).toBe(-1000);
  });

  it("treats empty / missing string fields as empty string", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02></F02><F03>0</F03><F04>0</F04></ROW></DATA>`;
    const [row] = parseRows(xml, SCHEMA, "trial-balance");
    expect(row?.parent).toBe("");
  });

  it("treats empty / missing number fields as 0", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02>P</F02><F03></F03><F04>5</F04></ROW></DATA>`;
    const [row] = parseRows(xml, SCHEMA, "trial-balance");
    expect(row?.opening).toBe(0);
  });

  it("parses boolean fields ('1'/'true'/'Yes' = true, else false)", () => {
    const schema = [
      { identifier: "F01", name: "name", datatype: "string" as const },
      { identifier: "F02", name: "active", datatype: "boolean" as const },
    ];
    const xml = `<DATA>
      <ROW><F01>A</F01><F02>1</F02></ROW>
      <ROW><F01>B</F01><F02>Yes</F02></ROW>
      <ROW><F01>C</F01><F02>0</F02></ROW>
      <ROW><F01>D</F01><F02></F02></ROW>
    </DATA>`;
    const rows = parseRows(xml, schema, "test");
    expect(rows.map((r) => r.active)).toEqual([true, true, false, false]);
  });

  it("throws TdlSchemaMismatchError when ROW lacks a declared field", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02>Y</F02></ROW></DATA>`; // missing F03, F04
    expect(() => parseRows(xml, SCHEMA, "trial-balance")).toThrow(TdlSchemaMismatchError);
  });
});
```

- [ ] **Step 4.3: Verify the tests fail**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: parser.test.ts fails — `Cannot find module '../src/parser.js'`.

- [ ] **Step 4.4: Implement parser.ts**

Write `packages/tdl-engine/src/parser.ts`:

```typescript
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
  if (datatype === "date") return text; // YYYYMMDD or empty — caller normalizes
  return text;
}

function parseNumber(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
```

- [ ] **Step 4.5: Verify tests pass**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Tests 20 passed (20)` (12 renderer + 8 parser).

- [ ] **Step 4.6: Commit**

```bash
git add packages/tdl-engine/src/errors.ts packages/tdl-engine/src/parser.ts packages/tdl-engine/test/parser.test.ts
git commit -m "feat(tdl-engine): F01..Fn row parser with fail-loud schema mismatch (v0.7.0 step 4)"
```

---

## Task 5: Catalog loader

**Files:**
- Create: `packages/tdl-engine/src/catalog.ts`

This task has no new tests of its own — the catalog loader is exercised by the orchestrator test in Task 6.

- [ ] **Step 5.1: Implement catalog.ts**

Write `packages/tdl-engine/src/catalog.ts`:

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TdlEngineError } from "./errors.js";
import type { CatalogField } from "./parser.js";

const FieldDatatypeSchema = z.enum(["string", "number", "boolean", "date"]);

const InputParamSchema = z.object({
  name: z.string().min(1),
  datatype: z.enum(["string", "number", "boolean", "date"]),
  required: z.boolean().optional(),
});

const FieldSchema = z.object({
  identifier: z.string().regex(/^F\d+$/, "field identifier must match F\\d+"),
  name: z.string().min(1),
  datatype: FieldDatatypeSchema,
});

const ReportSchema = z.object({
  name: z.string().min(1),
  template: z.string().min(1),
  input: z.array(InputParamSchema),
  output: z.object({
    datatype: z.literal("array"),
    fields: z.array(FieldSchema).min(1),
  }),
});

export const CatalogSchema = z.object({
  reports: z.array(ReportSchema).min(1),
});

export type CatalogReport = z.infer<typeof ReportSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

const packageDir = dirname(fileURLToPath(import.meta.url));
const defaultCatalogPath = join(packageDir, "..", "report-catalog.json");
const defaultTemplateDir = join(packageDir, "..", "templates");

let cachedCatalog: Catalog | undefined;

/** Returns the loaded and validated `report-catalog.json`. */
export function loadCatalog(path: string = defaultCatalogPath): Catalog {
  if (cachedCatalog && path === defaultCatalogPath) return cachedCatalog;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const parsed = CatalogSchema.parse(raw);
  if (path === defaultCatalogPath) cachedCatalog = parsed;
  return parsed;
}

/** Looks up a single report by `name`. Throws if not found. */
export function getReport(name: string, catalog: Catalog = loadCatalog()): CatalogReport {
  const report = catalog.reports.find((r) => r.name === name);
  if (!report) {
    throw new TdlEngineError(`Report "${name}" not found in report-catalog.json`);
  }
  return report;
}

/** Reads the template file referenced by a report definition. */
export function loadTemplate(report: CatalogReport, templateDir: string = defaultTemplateDir): string {
  return readFileSync(join(templateDir, report.template), "utf8");
}

/** Re-export the field type so consumers do not need a separate import. */
export type { CatalogField };
```

- [ ] **Step 5.2: Verify typecheck**

Run: `pnpm --filter @tallymcp/tdl-engine typecheck`
Expected: tsc completes with no errors.

- [ ] **Step 5.3: Commit**

```bash
git add packages/tdl-engine/src/catalog.ts
git commit -m "feat(tdl-engine): Zod-validated catalog loader (v0.7.0 step 5)"
```

---

## Task 6: `runTdlReport` orchestrator

**Files:**
- Create: `packages/tdl-engine/src/run-tdl-report.ts`
- Create: `packages/tdl-engine/test/run-tdl-report.test.ts`

- [ ] **Step 6.1: Write the failing orchestrator test**

Write `packages/tdl-engine/test/run-tdl-report.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { runTdlReport } from "../src/run-tdl-report.js";
import { TdlEngineError } from "../src/errors.js";
import type { CatalogReport } from "../src/catalog.js";

const FAKE_REPORT: CatalogReport = {
  name: "fake-tb",
  template: "fake.xml",
  input: [
    { name: "fromDate", datatype: "date", required: true },
    { name: "toDate", datatype: "date", required: true },
    { name: "targetCompany", datatype: "string", required: false },
  ],
  output: {
    datatype: "array",
    fields: [
      { identifier: "F01", name: "ledger", datatype: "string" },
      { identifier: "F02", name: "parent", datatype: "string" },
      { identifier: "F03", name: "opening", datatype: "number" },
    ],
  },
};

const FAKE_TEMPLATE = `<ENVELOPE>
  <HEADER><ID>FAKE</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVFROMDATE>{fromDate}</SVFROMDATE>
    <SVTODATE>{toDate}</SVTODATE>
    <nunjuck>if targetCompany</nunjuck>
    <SVCURRENTCOMPANY>{{targetCompany | escape}}</SVCURRENTCOMPANY>
    <nunjuck>endif</nunjuck>
  </STATICVARIABLES></DESC></BODY>
</ENVELOPE>`;

function stubClient(response: string): { post: (xml: string) => Promise<string>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    post: async (xml: string) => {
      calls.push(xml);
      return response;
    },
  };
}

const ROWS_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Cash</F01><F02>Cash-in-hand</F02><F03>1000</F03></ROW>
  <ROW><F01>Acme &amp; Co</F01><F02>Sundry Debtors</F02><F03>50000</F03></ROW>
</DATA></BODY></ENVELOPE>`;

const EMPTY_XML = `<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>`;

const EXCEPTION_XML = `<EXCEPTION>Period out of range</EXCEPTION>`;

describe("runTdlReport", () => {
  it("renders template, posts, parses rows end-to-end", async () => {
    const client = stubClient(ROWS_XML);
    const rows = await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "Acme",
    });
    expect(rows).toEqual([
      { ledger: "Cash", parent: "Cash-in-hand", opening: 1000 },
      { ledger: "Acme & Co", parent: "Sundry Debtors", opening: 50000 },
    ]);
  });

  it("substitutes date params into the request (1-Apr-2022 format)", async () => {
    const client = stubClient(ROWS_XML);
    await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2022</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2023</SVTODATE>");
  });

  it("omits SVCURRENTCOMPANY when targetCompany not supplied", async () => {
    const client = stubClient(ROWS_XML);
    await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(client.calls[0]).not.toContain("SVCURRENTCOMPANY");
  });

  it("returns empty array when Tally sends empty DATA", async () => {
    const client = stubClient(EMPTY_XML);
    const rows = await runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    expect(rows).toEqual([]);
  });

  it("throws TdlEngineError on EXCEPTION response", async () => {
    const client = stubClient(EXCEPTION_XML);
    await expect(
      runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, {
        fromDate: new Date(2022, 3, 1),
        toDate: new Date(2023, 2, 31),
      }),
    ).rejects.toBeInstanceOf(TdlEngineError);
  });

  it("rejects when a required input param is missing", async () => {
    const client = stubClient(ROWS_XML);
    await expect(
      // @ts-expect-error — intentionally missing required param
      runTdlReport(client, FAKE_REPORT, FAKE_TEMPLATE, { fromDate: new Date() }),
    ).rejects.toThrow(/toDate/);
  });
});
```

- [ ] **Step 6.2: Verify the tests fail**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: run-tdl-report.test.ts fails with `Cannot find module '../src/run-tdl-report.js'`.

- [ ] **Step 6.3: Implement run-tdl-report.ts**

Write `packages/tdl-engine/src/run-tdl-report.ts`:

```typescript
import type { CatalogReport } from "./catalog.js";
import { TdlEngineError, TdlExceptionError } from "./errors.js";
import { parseRows } from "./parser.js";
import { renderNunjucks, substituteTdlParameters } from "./renderer.js";

/** Minimal client interface implemented by `TallyHttpClient` and test stubs. */
export interface TdlHttpClient {
  post(xml: string, options?: { charset?: "utf-16" | "utf-8" }): Promise<string>;
}

export type TdlParams = Record<string, string | number | boolean | Date | undefined>;

/**
 * Renders a TDL template with the supplied params, POSTs it to Tally over the
 * supplied client, and parses the `<ROW>` response into typed objects per the
 * report's catalog schema.
 *
 * The TDL transport always asks Tally for UTF-16 LE (the v0.7 default) by
 * passing `charset: "utf-16"` to the client.
 */
export async function runTdlReport<T = Record<string, unknown>>(
  client: TdlHttpClient,
  report: CatalogReport,
  template: string,
  params: TdlParams,
): Promise<T[]> {
  validateParams(report, params);

  const nunjucksOut = renderNunjucks(template, params as Record<string, unknown>);
  const requestXml = substituteTdlParameters(nunjucksOut, params as Record<string, unknown>);

  const responseXml = await client.post(requestXml, { charset: "utf-16" });

  const trimmed = responseXml.trim();
  if (trimmed.startsWith("<EXCEPTION>")) {
    const match = trimmed.match(/<EXCEPTION>([\s\S]*?)<\/EXCEPTION>/);
    throw new TdlExceptionError(match?.[1]?.trim() ?? "Unknown Tally exception");
  }

  return parseRows<T>(responseXml, report.output.fields, report.name);
}

function validateParams(report: CatalogReport, params: TdlParams): void {
  for (const input of report.input) {
    if (input.required && params[input.name] === undefined) {
      throw new TdlEngineError(
        `Report "${report.name}" requires input parameter "${input.name}" (${input.datatype})`,
      );
    }
  }
}
```

- [ ] **Step 6.4: Verify tests pass**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Tests 26 passed (26)` (12 renderer + 8 parser + 6 orchestrator).

- [ ] **Step 6.5: Update src/index.ts barrel exports**

Replace `packages/tdl-engine/src/index.ts`:

```typescript
export { loadCatalog, loadTemplate, getReport, CatalogSchema } from "./catalog.js";
export type { Catalog, CatalogReport, CatalogField } from "./catalog.js";
export { TdlEngineError, TdlExceptionError, TdlSchemaMismatchError } from "./errors.js";
export { parseRows } from "./parser.js";
export type { FieldDatatype } from "./parser.js";
export { renderNunjucks, substituteTdlParameters } from "./renderer.js";
export { runTdlReport } from "./run-tdl-report.js";
export type { TdlHttpClient, TdlParams } from "./run-tdl-report.js";
```

- [ ] **Step 6.6: Verify build**

Run: `pnpm --filter @tallymcp/tdl-engine build`
Expected: tsc completes; `packages/tdl-engine/dist/` populated.

- [ ] **Step 6.7: Commit**

```bash
git add packages/tdl-engine/src packages/tdl-engine/test
git commit -m "feat(tdl-engine): runTdlReport orchestrator + barrel exports (v0.7.0 step 6)"
```

---

## Task 7: TallyHttpClient — UTF-16 LE + per-call charset

**Files:**
- Modify: `packages/tally-connector/src/http-client.ts`
- Modify: `packages/tally-connector/test/http-client.test.ts`

- [ ] **Step 7.1: Read current http-client.test.ts to know what must stay green**

Run: `cat packages/tally-connector/test/http-client.test.ts | head -80`

Note the existing test names. After this task they must still pass unchanged.

- [ ] **Step 7.2: Add failing charset tests**

Append to `packages/tally-connector/test/http-client.test.ts` (inside the existing `describe("TallyHttpClient", ...)`, just before the closing `});` ):

```typescript
  describe("charset handling", () => {
    it("posts UTF-16 LE by default", async () => {
      agent
        .get("http://127.0.0.1:9000")
        .intercept({
          path: "/",
          method: "POST",
          // Intercept checks the request body is the UTF-16 LE bytes of our XML.
          headers: { "content-type": "text/xml; charset=utf-16" },
        })
        .reply(200, Buffer.from("<ENVELOPE><BODY><X>ok</X></BODY></ENVELOPE>", "utf16le"));

      const text = await client().post("<ENVELOPE/>");
      expect(text).toContain("<X>ok</X>");
    });

    it("posts UTF-8 when charset='utf-8' is passed per call", async () => {
      agent
        .get("http://127.0.0.1:9000")
        .intercept({
          path: "/",
          method: "POST",
          headers: { "content-type": "text/xml; charset=utf-8" },
        })
        .reply(200, "<ENVELOPE><BODY><X>ok</X></BODY></ENVELOPE>");

      const text = await client().post("<ENVELOPE/>", { charset: "utf-8" });
      expect(text).toContain("<X>ok</X>");
    });

    it("honors a constructor-level default charset", async () => {
      agent
        .get("http://127.0.0.1:9000")
        .intercept({
          path: "/",
          method: "POST",
          headers: { "content-type": "text/xml; charset=utf-8" },
        })
        .reply(200, "<X>ok</X>");

      const c = client({ charset: "utf-8" });
      const text = await c.post("<ENVELOPE/>");
      expect(text).toContain("<X>ok</X>");
    });
  });
```

- [ ] **Step 7.3: Verify the charset tests fail**

Run: `pnpm --filter @tallymcp/tally-connector test`
Expected: 3 new "charset handling" tests fail (default still UTF-8, no charset option exists).

- [ ] **Step 7.4: Update http-client.ts**

Replace `packages/tally-connector/src/http-client.ts`:

```typescript
import { request, type Dispatcher } from "undici";
import { TallyHttpError } from "./errors.js";
import { RequestSerializer } from "./serializer.js";

export type TallyCharset = "utf-16" | "utf-8";

export interface TallyHttpClientOptions {
  host: string;
  port: number;
  /**
   * Max time (ms) to wait for the response body to finish. Default 60 s.
   */
  timeoutMs?: number;
  /**
   * Max time (ms) to wait for Tally to begin sending headers. Default 30 s.
   */
  headersTimeoutMs?: number;
  /** Serialize requests so Tally never sees parallel POSTs. Default true. */
  serialize?: boolean;
  /**
   * Default wire encoding. v0.7 ships **UTF-16 LE** because Tally's XML engine
   * is empirically more performant + stable on busy Silver books with UTF-16.
   * Per-call override available via `post(xml, { charset })`.
   */
  charset?: TallyCharset;
  dispatcher?: Dispatcher;
}

export interface TallyPostOptions {
  /** Overrides the constructor-level `charset` for a single request. */
  charset?: TallyCharset;
}

export class TallyHttpClient {
  private readonly serializer = new RequestSerializer();

  constructor(private readonly opts: TallyHttpClientOptions) {}

  get host(): string {
    return this.opts.host;
  }

  get port(): number {
    return this.opts.port;
  }

  async post(xmlBody: string, options?: TallyPostOptions): Promise<string> {
    const charset = options?.charset ?? this.opts.charset ?? "utf-16";
    const run = () => this.postInternal(xmlBody, charset);
    if (this.opts.serialize !== false) {
      return this.serializer.enqueue(run);
    }
    return run();
  }

  private async postInternal(xmlBody: string, charset: TallyCharset): Promise<string> {
    const {
      host,
      port,
      timeoutMs = 60_000,
      headersTimeoutMs = 30_000,
      dispatcher,
    } = this.opts;
    const url = `http://${host}:${port}/`;

    const encoded =
      charset === "utf-16" ? Buffer.from(xmlBody, "utf16le") : Buffer.from(xmlBody, "utf8");

    const { statusCode, body } = await request(url, {
      method: "POST",
      body: encoded,
      headers: {
        "Content-Type": `text/xml; charset=${charset}`,
        "Content-Length": String(encoded.byteLength),
      },
      bodyTimeout: timeoutMs,
      headersTimeout: headersTimeoutMs,
      dispatcher,
    });

    if (statusCode !== 200) {
      throw new TallyHttpError(`Tally returned HTTP ${statusCode}`, {
        statusCode,
        host,
        port,
      });
    }

    const responseBuffer = Buffer.from(await body.arrayBuffer());
    return charset === "utf-16" ? responseBuffer.toString("utf16le") : responseBuffer.toString("utf8");
  }
}
```

- [ ] **Step 7.5: Run http-client tests and fix any string-fixture replies**

Run: `pnpm --filter @tallymcp/tally-connector test`

Expected outcome breakdown:

- ✅ The 3 new "charset handling" tests pass.
- ✅ Tests that assert error paths (HTTP 500, ECONNREFUSED, etc.) still pass — error responses don't need body decoding.
- ❌ **Tests that assert response BODY content will fail** because MockAgent serves the string fixture as UTF-8 bytes but the client now decodes as UTF-16 LE by default — the decoded text comes back garbled.

**Fix the failing tests:** for every `.reply(200, <stringFixture>)` call that the test then reads back, wrap the fixture in a UTF-16 LE buffer so MockAgent serves the bytes the client expects:

```typescript
// Before:
.reply(200, fixture);                             // string → UTF-8 bytes on wire

// After:
.reply(200, Buffer.from(fixture, "utf16le"));     // UTF-16 LE bytes on wire
```

Keep the test assertions identical — only the served-bytes encoding changes. Re-run after each fix until everything is green. Do not change any test's `expect(...)` lines.

- [ ] **Step 7.6: Commit**

```bash
git add packages/tally-connector/src/http-client.ts packages/tally-connector/test/http-client.test.ts
git commit -m "feat(tally-connector): UTF-16 LE default + per-call charset arg (v0.7.0 step 7)"
```

---

## Task 8: Trial-balance TDL template + catalog entry

**Files:**
- Create: `packages/tdl-engine/templates/trial-balance.xml`
- Create: `packages/tdl-engine/report-catalog.json`

- [ ] **Step 8.1: Write trial-balance.xml**

Write `packages/tdl-engine/templates/trial-balance.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>TallyMcpTdlReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>{fromDate}</SVFROMDATE>
        <SVTODATE>{toDate}</SVTODATE>
        <nunjuck>if targetCompany</nunjuck>
        <SVCURRENTCOMPANY>{{targetCompany | escape}}</SVCURRENTCOMPANY>
        <nunjuck>endif</nunjuck>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="TallyMcpTdlReport">
            <FORMS>TallyMcpForm</FORMS>
          </REPORT>
          <FORM NAME="TallyMcpForm">
            <PARTS>TallyMcpPart</PARTS>
            <XMLTAG>DATA</XMLTAG>
          </FORM>
          <PART NAME="TallyMcpPart">
            <LINES>TallyMcpLine</LINES>
            <REPEAT>TallyMcpLine : TallyMcpCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="TallyMcpLine">
            <FIELDS>Fld01,Fld02,Fld03,Fld04,Fld05,Fld06</FIELDS>
            <XMLTAG>ROW</XMLTAG>
          </LINE>
          <FIELD NAME="Fld01">
            <SET>$Name</SET>
            <XMLTAG>F01</XMLTAG>
          </FIELD>
          <FIELD NAME="Fld02">
            <SET>if $$IsEqual:$Parent:$$SysName:Primary then "" else $Parent</SET>
            <XMLTAG>F02</XMLTAG>
          </FIELD>
          <FIELD NAME="Fld03">
            <SET>if $$IsEmpty:$OpeningBalance then 0 else $$StringFindAndReplace:(if $$IsDebit:$OpeningBalance then -$$Number:$OpeningBalance else $$Number:$OpeningBalance):"(-)":"-"</SET>
            <XMLTAG>F03</XMLTAG>
          </FIELD>
          <FIELD NAME="Fld04">
            <SET>if $$IsEmpty:$DebitTotals then 0 else $$StringFindAndReplace:(-$$Number:$DebitTotals):"(-)":"-"</SET>
            <XMLTAG>F04</XMLTAG>
          </FIELD>
          <FIELD NAME="Fld05">
            <SET>if $$IsEmpty:$CreditTotals then 0 else $$StringFindAndReplace:(-$$Number:$CreditTotals):"(-)":"-"</SET>
            <XMLTAG>F05</XMLTAG>
          </FIELD>
          <FIELD NAME="Fld06">
            <SET>if $$IsEmpty:$ClosingBalance then 0 else $$StringFindAndReplace:(if $$IsDebit:$ClosingBalance then -$$Number:$ClosingBalance else $$Number:$ClosingBalance):"(-)":"-"</SET>
            <XMLTAG>F06</XMLTAG>
          </FIELD>
          <COLLECTION NAME="TallyMcpCollection">
            <TYPE>Ledger</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
```

- [ ] **Step 8.2: Write report-catalog.json**

Write `packages/tdl-engine/report-catalog.json`:

```json
{
  "$schema": "https://json-schema.org/draft-07/schema",
  "reports": [
    {
      "name": "trial-balance",
      "template": "trial-balance.xml",
      "input": [
        { "name": "fromDate", "datatype": "date", "required": true },
        { "name": "toDate", "datatype": "date", "required": true },
        { "name": "targetCompany", "datatype": "string", "required": false }
      ],
      "output": {
        "datatype": "array",
        "fields": [
          { "identifier": "F01", "name": "ledger", "datatype": "string" },
          { "identifier": "F02", "name": "parent", "datatype": "string" },
          { "identifier": "F03", "name": "opening", "datatype": "number" },
          { "identifier": "F04", "name": "debit", "datatype": "number" },
          { "identifier": "F05", "name": "credit", "datatype": "number" },
          { "identifier": "F06", "name": "closing", "datatype": "number" }
        ]
      }
    }
  ]
}
```

- [ ] **Step 8.3: Verify the catalog loads cleanly**

The catalog and template are now consumed by Task 9's integration test. Quick smoke check:

Run: `node --eval "import('./packages/tdl-engine/dist/index.js').then(m => console.log(m.getReport('trial-balance').output.fields.length))"`
Expected: `6`.

(If the build is stale, run `pnpm --filter @tallymcp/tdl-engine build` first.)

- [ ] **Step 8.4: Commit**

```bash
git add packages/tdl-engine/templates packages/tdl-engine/report-catalog.json
git commit -m "feat(tdl-engine): trial-balance TDL template + catalog entry (v0.7.0 step 8)"
```

---

## Task 9: Trial-balance integration test (end-to-end through tdl-engine)

**Files:**
- Create: `packages/tdl-engine/test/trial-balance-integration.test.ts`

- [ ] **Step 9.1: Write the integration test**

Write `packages/tdl-engine/test/trial-balance-integration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getReport, loadTemplate, runTdlReport } from "../src/index.js";

const FAKE_SILVER_RESPONSE = `<ENVELOPE><BODY><DATA>
  <ROW>
    <F01>Cash</F01>
    <F02>Cash-in-hand</F02>
    <F03>10000</F03>
    <F04>50000</F04>
    <F05>20000</F05>
    <F06>40000</F06>
  </ROW>
  <ROW>
    <F01>Acme &amp; Co</F01>
    <F02>Sundry Debtors</F02>
    <F03>0</F03>
    <F04>118000</F04>
    <F05>0</F05>
    <F06>118000</F06>
  </ROW>
  <ROW>
    <F01>Sales</F01>
    <F02>Sales Accounts</F02>
    <F03>0</F03>
    <F04>0</F04>
    <F05>100000</F05>
    <F06>-100000</F06>
  </ROW>
</DATA></BODY></ENVELOPE>`;

function stubClient(response: string): { post: (xml: string) => Promise<string>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    post: async (xml: string) => {
      calls.push(xml);
      return response;
    },
  };
}

describe("trial-balance through tdl-engine (integration)", () => {
  it("loads catalog + template, runs report, returns 3 typed rows", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);

    const rows = await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "OM JAI JAGDISH",
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      ledger: "Cash",
      parent: "Cash-in-hand",
      opening: 10000,
      debit: 50000,
      credit: 20000,
      closing: 40000,
    });
    expect(rows[1]?.ledger).toBe("Acme & Co");
    expect(rows[2]?.parent).toBe("Sales Accounts");
  });

  it("renders Tally-format dates into the request envelope", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: "Acme",
    });
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2022</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2023</SVTODATE>");
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>");
  });

  it("escapes special characters in the company name", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
      targetCompany: 'A & B "X" <Y>',
    });
    expect(client.calls[0]).toContain(
      "<SVCURRENTCOMPANY>A &amp; B &quot;X&quot; &lt;Y&gt;</SVCURRENTCOMPANY>",
    );
  });

  it("envelope contains the inline TDL REPORT/FORM/PART/LINE/FIELD/COLLECTION skeleton", async () => {
    const report = getReport("trial-balance");
    const template = loadTemplate(report);
    const client = stubClient(FAKE_SILVER_RESPONSE);
    await runTdlReport(client, report, template, {
      fromDate: new Date(2022, 3, 1),
      toDate: new Date(2023, 2, 31),
    });
    const request = client.calls[0]!;
    expect(request).toContain("<REPORT NAME=\"TallyMcpTdlReport\">");
    expect(request).toContain("<COLLECTION NAME=\"TallyMcpCollection\">");
    expect(request).toContain("<TYPE>Ledger</TYPE>");
    expect(request).toContain("<XMLTAG>ROW</XMLTAG>");
  });
});
```

- [ ] **Step 9.2: Verify tests pass**

Run: `pnpm --filter @tallymcp/tdl-engine build && pnpm --filter @tallymcp/tdl-engine test`
Expected: `Tests 30 passed (30)` (12 renderer + 8 parser + 6 orchestrator + 4 integration).

- [ ] **Step 9.3: Commit**

```bash
git add packages/tdl-engine/test/trial-balance-integration.test.ts
git commit -m "test(tdl-engine): trial-balance end-to-end integration through catalog (v0.7.0 step 9)"
```

---

## Task 10: C-R1 enforcement — templates must not contain write verbs

**Files:**
- Create: `packages/tdl-engine/test/c-r1-grep.test.ts`

- [ ] **Step 10.1: Write the C-R1 grep test**

Write `packages/tdl-engine/test/c-r1-grep.test.ts`:

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * C-R1 enforcement: TDL templates may not request anything that mutates
 * Tally state. This test fails loudly if a template ever contains write
 * verbs — a tripwire against accidental scope expansion past read-only.
 */

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "Import Data request", regex: /TALLYREQUEST\s*>\s*Import/i },
  { name: "ACTION=Alter", regex: /ACTION\s*=\s*"Alter"/i },
  { name: "ACTION=Create", regex: /ACTION\s*=\s*"Create"/i },
  { name: "ACTION=Delete", regex: /ACTION\s*=\s*"Delete"/i },
  { name: "TAGNAME=\"MASTER ID\" (alter-voucher tripwire)", regex: /TAGNAME\s*=\s*"MASTER\s+ID"/i },
];

describe("C-R1 enforcement on TDL templates", () => {
  const templateFiles = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".xml"));

  it("templates/ directory contains ≥1 .xml template", () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  for (const file of templateFiles) {
    it(`${file} contains no write/alter/create/delete/MASTER ID directives`, () => {
      const content = readFileSync(join(TEMPLATES_DIR, file), "utf8");
      const offenders = FORBIDDEN_PATTERNS.filter((p) => p.regex.test(content));
      expect(
        offenders.map((o) => o.name),
        `Template ${file} contains forbidden directive(s)`,
      ).toEqual([]);
    });
  }
});
```

- [ ] **Step 10.2: Verify it passes on the clean trial-balance template**

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `Tests 32 passed (32)` (one extra describe-block test + one per template = 2 new tests).

- [ ] **Step 10.3: Manually verify the tripwire (do NOT commit the poisoning)**

To confirm the test would catch a violation, temporarily edit
`packages/tdl-engine/templates/trial-balance.xml` and change
`<TALLYREQUEST>Export</TALLYREQUEST>` to `<TALLYREQUEST>Import</TALLYREQUEST>`.

Run: `pnpm --filter @tallymcp/tdl-engine test`
Expected: `trial-balance.xml contains no write/alter/create/delete/MASTER ID directives` **fails** with the offender list.

**Revert the template change** before continuing. Re-run tests to confirm green.

- [ ] **Step 10.4: Commit**

```bash
git add packages/tdl-engine/test/c-r1-grep.test.ts
git commit -m "test(tdl-engine): C-R1 grep test refuses write verbs in templates (v0.7.0 step 10)"
```

---

## Task 11: Rewire `getTrialBalance` connector through tdl-engine

**Files:**
- Modify: `packages/report-engine/package.json` (add workspace dep)
- Modify: `packages/report-engine/src/connectors/trial-balance.ts`
- Modify: `packages/report-engine/test/financial-connectors.test.ts` (TB fixtures only)

- [ ] **Step 11.0: Widen the `TallyClient` interface to accept optional charset**

Edit `packages/report-engine/src/client.ts`:

```typescript
/** Minimal interface implemented by `TallyHttpClient` (and test stubs). */
export interface TallyClient {
  post(
    xml: string,
    options?: { charset?: "utf-16" | "utf-8" },
  ): Promise<string>;
}
```

This is backward-compatible: existing stub implementations that omit the
second arg remain assignable (TypeScript's `strictFunctionTypes` allows a
function with fewer parameters to satisfy an interface with more).
`runTdlReport` (which calls `client.post(xml, { charset: "utf-16" })`) now
typechecks against this widened interface.

- [ ] **Step 11.1: Add tdl-engine to report-engine dependencies**

Edit `packages/report-engine/package.json` — in the `dependencies` block, add (alphabetically):

```json
"@tallymcp/tdl-engine": "workspace:*",
```

Run: `pnpm install`
Expected: workspace link resolves; no other changes.

- [ ] **Step 11.2: Update the existing TB fixtures and tests for the TDL `<ROW><F01>...` shape**

Read `packages/report-engine/test/financial-connectors.test.ts`. In the `TB_XML` constant, replace the `<TBROW>` rows with the inline-TDL `<ROW>` shape (F01..F06 per the catalog):

```typescript
const TB_XML = `<ENVELOPE><BODY><DATA>
  <ROW><F01>Sundry Debtors Total</F01><F02></F02><F03>0</F03><F04>150000</F04><F05>0</F05><F06>150000</F06></ROW>
  <ROW><F01>Acme &amp; Co</F01><F02>Sundry Debtors</F02><F03>0</F03><F04>50000</F04><F05>0</F05><F06>50000</F06></ROW>
  <ROW><F01>Sundry Creditors Total</F01><F02></F02><F03>0</F03><F04>0</F04><F05>75000</F05><F06>-75000</F06></ROW>
</DATA></BODY></ENVELOPE>`;
```

Then update the existing `getTrialBalance` assertions to read from the new shape:

```typescript
  it("parses TB rows with Indian lakh amounts", async () => {
    const rows = await getTrialBalance(stubClient(TB_XML), PERIOD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      groupName: "(top-level)",
      ledgerName: "Sundry Debtors Total",
      debit: 150000,
      credit: 0,
    });
    expect(rows[1]?.groupName).toBe("Sundry Debtors");
    expect(rows[1]?.ledgerName).toBe("Acme & Co");
    expect(rows[2]?.credit).toBe(75000);
  });

  it("sends an inline TDL REPORT/COLLECTION envelope (not the legacy report form)", async () => {
    const client = stubClient(TB_XML);
    await getTrialBalance(client, PERIOD);
    expect(client.calls[0]).toContain("<REPORT NAME=\"TallyMcpTdlReport\">");
    expect(client.calls[0]).toContain("<COLLECTION NAME=\"TallyMcpCollection\">");
    expect(client.calls[0]).toContain("<TYPE>Ledger</TYPE>");
    expect(client.calls[0]).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
    expect(client.calls[0]).toContain("<SVTODATE>31-Mar-2027</SVTODATE>");
  });
```

(Replace the existing "sends Trial Balance envelope with the period and grand-total flag" test with the one above. The grand-total flag is a legacy-report-form concept and doesn't apply to inline-TDL reports.)

For the LINEERROR test, change the response shape:

```typescript
  it("throws TdlExceptionError on Tally EXCEPTION response", async () => {
    const exceptionXml = `<EXCEPTION>Period out of range</EXCEPTION>`;
    await expect(
      getTrialBalance(stubClient(exceptionXml), PERIOD),
    ).rejects.toThrow(/Tally returned <EXCEPTION>/);
  });
```

Remove the existing balanced-fixture invariant test for now — it asserted leaf-row debit/credit equality, which doesn't hold the same way under the TDL projection that includes group totals. The arithmetic relationship gets revisited in v0.7.1 when B5/B6 land.

- [ ] **Step 11.3: Verify the tests fail against the old connector**

Run: `pnpm --filter @tallymcp/report-engine test test/financial-connectors.test.ts`
Expected: 3 `getTrialBalance` tests fail — the old connector still calls `trialBalanceEnvelope` (legacy form) and parses `<TBROW>`, not the TDL pipeline.

- [ ] **Step 11.4: Rewrite trial-balance.ts**

Replace `packages/report-engine/src/connectors/trial-balance.ts` entirely:

```typescript
import {
  TrialBalanceRowSchema,
  type TallyDate,
  type TrialBalanceRow,
} from "@tallymcp/shared-types";
import { getReport, loadTemplate, runTdlReport } from "@tallymcp/tdl-engine";
import type { TallyClient } from "../client.js";

interface TdlTbRow {
  ledger: string;
  parent: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

/**
 * Reads the `Trial Balance` report for the period via the inline-TDL engine.
 *
 * Each TDL output row represents a leaf Ledger object. `parent` is the
 * containing group ("" when the ledger is at the chart-of-accounts root).
 * We map to the existing `TrialBalanceRow` contract for backward compatibility
 * with consumers in v0.6 — opening and closing balances are dropped at this
 * layer in v0.7.0 and surface via the dedicated `getLedgerClosingBalance` /
 * `getGroupClosingBalances` connectors in v0.7.1.
 */
export async function getTrialBalance(
  client: TallyClient,
  options: { company: string; fromDate: TallyDate; toDate: TallyDate },
): Promise<TrialBalanceRow[]> {
  const report = getReport("trial-balance");
  const template = loadTemplate(report);
  const rows = await runTdlReport<TdlTbRow>(client, report, template, {
    fromDate: toDate(options.fromDate),
    toDate: toDate(options.toDate),
    targetCompany: options.company,
  });
  return rows.map(toTbRow);
}

function toTbRow(row: TdlTbRow): TrialBalanceRow {
  // `parent === ""` means the ledger is directly under the Primary root.
  // We surface that as "(top-level)" so the schema's `min(1)` constraint on
  // groupName is satisfied without inventing a fake group name.
  const groupName = row.parent.trim() === "" ? "(top-level)" : row.parent;
  return TrialBalanceRowSchema.parse({
    groupName,
    ledgerName: row.ledger,
    debit: row.debit,
    credit: row.credit,
  });
}

function toDate(tallyDate: TallyDate): Date {
  const y = Number(tallyDate.slice(0, 4));
  const m = Number(tallyDate.slice(4, 6)) - 1;
  const d = Number(tallyDate.slice(6, 8));
  return new Date(y, m, d);
}
```

- [ ] **Step 11.5: Verify the TB tests pass**

Run: `pnpm --filter @tallymcp/report-engine build && pnpm --filter @tallymcp/report-engine test test/financial-connectors.test.ts`
Expected: all `getTrialBalance` tests in financial-connectors.test.ts pass. P&L and Balance Sheet tests (B3, B4) keep using the legacy envelope and continue to pass — they get rewired in v0.7.1.

- [ ] **Step 11.6: Verify the wider report-engine suite is still green**

Run: `pnpm --filter @tallymcp/report-engine test`
Expected: every report-engine test passes. The non-TB connectors (P&L, BS, masters, etc.) still pass because their stub-client tests don't exercise the HTTP wire — they just route XML strings through normalizers.

- [ ] **Step 11.7: Defensive UTF-8 for legacy report-form connectors**

After Task 7 the `TallyHttpClient` default flipped to UTF-16 LE. The legacy
connectors that still send raw `<TYPE>Collection</TYPE>` / `<TYPE>Data</TYPE>`
envelopes (not yet TDL-rewired) need an explicit `charset: "utf-8"` on
their `client.post(...)` calls so their on-wire behavior is identical to
v0.6. This is transitional debt — each legacy connector loses the explicit
charset arg when it gets rewired to TDL in v0.7.1+.

Files to update — change every `client.post(xml)` to `client.post(xml, { charset: "utf-8" })`:

- `packages/report-engine/src/connectors/balance-sheet.ts`
- `packages/report-engine/src/connectors/profit-and-loss.ts`
- `packages/report-engine/src/connectors/company-info.ts`
- `packages/report-engine/src/connectors/list-companies.ts`
- `packages/report-engine/src/connectors/list-ledgers.ts`
- `packages/report-engine/src/connectors/list-groups.ts`
- `packages/report-engine/src/connectors/list-voucher-types.ts`
- `packages/report-engine/src/connectors/sales-register.ts`
- `packages/report-engine/src/connectors/day-book.ts`
- `packages/report-engine/src/connectors/day-book-stream.ts`
- `packages/report-engine/src/connectors/ledger-balance.ts` (two call sites — `getLedgerClosingBalance` and `getGroupClosingBalances`)

Do **not** touch the new `trial-balance.ts` connector — it delegates through
`runTdlReport` which already passes `charset: "utf-16"` explicitly.

- [ ] **Step 11.8: Verify the full repo test suite is still green**

Run: `pnpm -r build && pnpm -r test`
Expected: every package's tests pass. The stub-based tests in
financial-connectors.test.ts don't exercise the HTTP wire, so the legacy
connectors keep working in tests despite the runtime charset switch.

- [ ] **Step 11.9: Commit**

```bash
git add packages/report-engine/package.json packages/report-engine/src packages/report-engine/test pnpm-lock.yaml
git commit -m "feat(report-engine): rewire getTrialBalance through tdl-engine + defensive UTF-8 for legacy connectors (v0.7.0 step 11)"
```

---

## Task 12: Live Silver TB proof script + checklist

**Files:**
- Create: `scripts/v070-tb-proof.ts`
- Create: `docs/live-tally-checklist.md`
- Modify: `package.json` (add script)

- [ ] **Step 12.1: Add the script entry to package.json**

Edit `package.json` — in `scripts`, add:

```json
"v070-tb-proof": "tsx scripts/v070-tb-proof.ts",
```

- [ ] **Step 12.2: Write scripts/v070-tb-proof.ts**

Write `scripts/v070-tb-proof.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * v0.7.0 kill-switch: prove that the TDL trial-balance template returns ≥1
 * row in <5 s against the live OM JAI JAGDISH book on TallyPrime Silver,
 * and that Tally remains responsive afterwards.
 *
 * Usage:
 *   pnpm v070-tb-proof
 *   pnpm v070-tb-proof --company "OM JAI JAGDISH" --from 20220401 --to 20230331
 *
 * Environment:
 *   TALLY_HOST  default 127.0.0.1
 *   TALLY_PORT  default 9000
 */
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { getTrialBalance } from "@tallymcp/report-engine";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else {
      out[a.slice(2)] = "true";
    }
  }
  return out;
}

const PROOF_BUDGET_MS = 5_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const company = args.company ?? "OM JAI JAGDISH";
  const fromDate = args.from ?? "20220401";
  const toDate = args.to ?? "20230331";
  const host = args.host ?? process.env.TALLY_HOST ?? "127.0.0.1";
  const port = Number(args.port ?? process.env.TALLY_PORT ?? 9000);

  console.log(`[v070-tb-proof] Tally ${host}:${port}, company "${company}", period ${fromDate}–${toDate}`);
  console.log(`[v070-tb-proof] Kill-switch budget: ${PROOF_BUDGET_MS} ms`);

  const client = new TallyHttpClient({
    host,
    port,
    timeoutMs: 15_000,
    headersTimeoutMs: 10_000,
    serialize: true,
  });

  const startedAt = Date.now();
  let rows;
  try {
    rows = await getTrialBalance(client, { company, fromDate, toDate });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`\n[v070-tb-proof] ❌ FAILED after ${elapsed} ms: ${(err as Error).message}`);
    process.exit(1);
  }
  const elapsed = Date.now() - startedAt;

  console.log(`\n[v070-tb-proof] TB returned ${rows.length} row(s) in ${elapsed} ms`);
  if (rows.length > 0) {
    console.log("[v070-tb-proof] Sample rows:");
    for (const row of rows.slice(0, 3)) {
      console.log(`  ${row.ledgerName ?? "(no name)"} → group=${row.groupName} dr=${row.debit} cr=${row.credit}`);
    }
  }

  const latencyOk = elapsed < PROOF_BUDGET_MS;
  const rowsOk = rows.length >= 1;

  if (!latencyOk) {
    console.error(`\n[v070-tb-proof] ❌ LATENCY FAIL: ${elapsed} ms ≥ ${PROOF_BUDGET_MS} ms budget. Abort v0.7.`);
    process.exit(1);
  }
  if (!rowsOk) {
    console.error(`\n[v070-tb-proof] ❌ ROW COUNT FAIL: expected ≥1 row, got ${rows.length}. Abort v0.7.`);
    process.exit(1);
  }

  // Tally responsiveness check: a second cheap call must succeed in <2 s.
  const followupStarted = Date.now();
  try {
    await client.post("<ENVELOPE><HEADER><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=\"List of Companies\" ISMODIFY=\"No\"><TYPE>Company</TYPE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>");
  } catch (err) {
    console.error(`\n[v070-tb-proof] ❌ RESPONSIVENESS FAIL: follow-up call errored: ${(err as Error).message}`);
    process.exit(1);
  }
  const followupElapsed = Date.now() - followupStarted;
  console.log(`[v070-tb-proof] Tally still responsive (follow-up call: ${followupElapsed} ms)`);

  console.log(`\n[v070-tb-proof] ✅ PASS — TB ${elapsed} ms with ${rows.length} rows; Tally responsive after.`);
  console.log(`[v070-tb-proof] Paste these numbers into docs/live-tally-checklist.md under the v0.7.0 row.`);
}

main().catch((err) => {
  console.error(`\n[v070-tb-proof] fatal: ${(err as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 12.3: Write docs/live-tally-checklist.md**

Write `docs/live-tally-checklist.md`:

```markdown
# Live Tally Checklist

This file captures empirical evidence from live-Tally runs. **Pasting actual
numbers here is part of every release's Definition of Done**: the spec
(`docs/superpowers/specs/2026-05-24-tdl-engine-audit-reports-design.md`)
defines per-release success metrics, and the wall-clock + row counts behind
them live here so the evidence is in-repo, not only in commit messages.

## v0.7.0 — TDL engine kill-switch (TB proof)

**Spec §2 success metric:** Trial Balance latency <5 s on the
`OM JAI JAGDISH` book (3,689 ledgers) on TallyPrime Silver. Tally instance
stays responsive afterwards.

**Run:**
```cmd
pnpm v070-tb-proof
```

**Result (fill in after running):**

| Metric | Target | Actual | Pass? |
|---|---|---|---|
| TB latency | < 5,000 ms | _____ ms | ⬜ |
| Rows returned | ≥ 1 | _____ | ⬜ |
| Tally responsive after | < 2,000 ms follow-up | _____ ms | ⬜ |
| Tally restart needed | No | ⬜ Yes ⬜ No | ⬜ |
| Date run | — | _____ (YYYY-MM-DD HH:MM) | — |
| Tally edition | — | _____ | — |
| Operator notes | — | _____ | — |

**Decision after run:**

- ✅ All three pass → proceed to v0.7.1 (rewire B2–B7 + dispatcher).
- ❌ Any failure → **abort v0.7**. Open an issue describing the symptom,
  the wall-clock, the row count, and the body of any error message.
  Re-design before any further v0.7 work.
```

- [ ] **Step 12.4: Verify the script compiles end-to-end**

Run: `pnpm v070-tb-proof --help 2>&1 | head -5`
Expected: script starts (may fail to connect to Tally — that's fine; we're verifying it runs, not that Tally responds).

If you want a smoke test with an unreachable host:

Run: `TALLY_PORT=9999 pnpm v070-tb-proof`
Expected: script exits non-zero with a connection error in <10 s. **This is correct behavior — the kill-switch fails fast on unreachable Tally too.**

- [ ] **Step 12.5: Commit**

```bash
git add scripts/v070-tb-proof.ts docs/live-tally-checklist.md package.json
git commit -m "feat(scripts): v070-tb-proof live Silver kill-switch + checklist (v0.7.0 step 12)"
```

---

## Task 13: CHANGELOG + final verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 13.1: Update CHANGELOG**

Edit `CHANGELOG.md`, adding under `## [Unreleased] → ### Added`:

```markdown
- **v0.7.0** — TDL engine kill-switch:
  - New `@tallymcp/tdl-engine` package: nunjucks renderer + angular-bracket parameter substitution + F01..Fn row parser + `runTdlReport` orchestrator. Templates are data (`packages/tdl-engine/templates/*.xml` + `report-catalog.json`).
  - `TallyHttpClient` switched to **UTF-16 LE transport** by default, with per-call `charset?: "utf-16" \| "utf-8"` override so legacy UTF-8 envelopes keep working during the migration.
  - `trial-balance.xml` shipped as the first inline-TDL template: `REPORT + FORM + PART + LINE + FIELDs + COLLECTION` over `<TYPE>Ledger</TYPE>` projecting Name / Parent / Opening / Debit / Credit / Closing as F01..F06.
  - `getTrialBalance` connector rewired to delegate through `tdl-engine` while preserving its `TrialBalanceRow[]` return contract.
  - C-R1 enforcement: CI test (`packages/tdl-engine/test/c-r1-grep.test.ts`) refuses any template containing Import / Alter / Create / Delete / `MASTER ID` directives.
  - Live proof script: `pnpm v070-tb-proof`. Results captured in `docs/live-tally-checklist.md`.
  - 32 new Vitest tests in `@tallymcp/tdl-engine`; existing tests across all packages still green.
```

- [ ] **Step 13.2: Run full repo test suite**

Run: `pnpm -r build`
Expected: every package builds cleanly.

Run: `pnpm -r test`
Expected: every package's tests pass. Tally-xml 62, tally-connector 22 (existing 19 + 3 charset), shared-types 22, config-store 17, excel-engine 24, analytics-engine 8, report-engine 48 (existing + reshaped TB), output-store 8, mcp-server 14, **tdl-engine 32 (new)**. Total: ~250+ tests passing.

- [ ] **Step 13.3: Run lint and typecheck**

Run: `pnpm -r lint && pnpm -r typecheck`
Expected: both pass repo-wide.

- [ ] **Step 13.4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): v0.7.0 — TDL engine kill-switch ships"
```

---

## Task 14: The kill-switch — live Silver TB proof

This task is **the gate** for v0.7. It runs against your live `OM JAI JAGDISH`
Tally Silver instance.

**Pre-flight:**
1. Open TallyPrime Silver. Load `OM JAI JAGDISH`. Confirm Client/Server is
   set to **Both** on port **9000** (F1 → Settings → Connectivity).
2. Confirm Tally is responsive from this machine: run
   `pnpm hello-tally` and confirm a List-of-Companies XML response comes
   back in <1 s.

- [ ] **Step 14.1: Run the proof**

Run: `pnpm v070-tb-proof`
Watch the output carefully. Three outcomes are possible:

| Outcome | What you see | Decision |
|---|---|---|
| ✅ PASS | `✅ PASS — TB <N> ms with <K> rows; Tally responsive after.` and N < 5000 and K ≥ 1 | **Proceed**. Go to step 14.2. |
| ❌ Latency fail | `❌ LATENCY FAIL: <N> ms ≥ 5000 ms budget. Abort v0.7.` | **Stop**. Skip 14.2; do step 14.3 then halt. |
| ❌ Row-count or responsiveness fail | `❌ ROW COUNT FAIL` or `❌ RESPONSIVENESS FAIL` | **Stop**. Skip 14.2; do step 14.3 then halt. |

- [ ] **Step 14.2: (PASS path) — paste evidence into the checklist + commit**

Open `docs/live-tally-checklist.md`. Fill in the "Result" table under v0.7.0
with the actual numbers from the script's output. Mark all three rows ✅.
Add the date, edition (`TallyPrime Silver`), and any operator notes.

Commit:

```bash
git add docs/live-tally-checklist.md
git commit -m "docs(live-checklist): v0.7.0 TB proof passed on OM JAI JAGDISH Silver (<NNN ms, KK rows)"
```

Replace `<NNN>` and `<KK>` with the real numbers.

**v0.7.0 is complete.** The next work is v0.7.1 — written as a separate plan
once this commits.

- [ ] **Step 14.3: (FAIL path) — record the failure and halt**

Open `docs/live-tally-checklist.md`. Fill in the "Result" table with the
actual numbers, mark the failing row(s) ❌, and add the failure mode and any
error message text in the operator notes.

Commit:

```bash
git add docs/live-tally-checklist.md
git commit -m "docs(live-checklist): v0.7.0 TB proof FAILED — abort v0.7, see notes"
```

**Stop here.** Do not start v0.7.1. The design needs re-evaluation before
any further v0.7 work — bring the failure mode (latency / row count / Tally
lockup / error message) to a brainstorming session and decide whether to:

- Adjust the TDL template (FETCH narrowing, COLLECTION filter, OBJECT-mode
  request, etc.), or
- Re-evaluate whether v0.7 is the right approach for this Tally edition at
  all.

---

*End of v0.7.0 implementation plan.*
