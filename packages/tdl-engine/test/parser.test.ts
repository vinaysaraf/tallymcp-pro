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
    const [row] = parseRows<{ opening: number; debit: number }>(xml, SCHEMA, "trial-balance");
    expect(row?.opening).toBe(123456.78);
    expect(row?.debit).toBe(-1000);
  });

  it("treats empty / missing string fields as empty string", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02></F02><F03>0</F03><F04>0</F04></ROW></DATA>`;
    const [row] = parseRows<{ parent: string }>(xml, SCHEMA, "trial-balance");
    expect(row?.parent).toBe("");
  });

  it("treats empty / missing number fields as 0", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02>P</F02><F03></F03><F04>5</F04></ROW></DATA>`;
    const [row] = parseRows<{ opening: number }>(xml, SCHEMA, "trial-balance");
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
    const rows = parseRows<{ active: boolean }>(xml, schema, "test");
    expect(rows.map((r) => r.active)).toEqual([true, true, false, false]);
  });

  it("throws TdlSchemaMismatchError when ROW lacks a declared field", () => {
    const xml = `<DATA><ROW><F01>X</F01><F02>Y</F02></ROW></DATA>`;
    expect(() => parseRows(xml, SCHEMA, "trial-balance")).toThrow(TdlSchemaMismatchError);
  });
});
