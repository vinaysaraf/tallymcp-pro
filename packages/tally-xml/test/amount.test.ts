import { describe, expect, it } from "vitest";
import { parseTallyAmount } from "../src/amount.js";
import { TallyAmountParseError, TallyXmlError } from "../src/errors.js";

describe("parseTallyAmount", () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ["", 0],
    ["0", 0],
    ["100", 100],
    ["100.00", 100],
    ["1,23,456.78", 123456.78],
    ["-1,23,456.78", -123456.78],
    ["(-)1,23,456.78", -123456.78],
    ["(-)1,23,456.78 Dr", -123456.78],
    ["1,23,456.78 Dr", 123456.78],
    ["1,23,456.78 Cr", -123456.78],
    ["(-)10.00", -10],
    ["500 Cr", -500],
    ["500 Dr", 500],
    ["12,34,567", 1234567],
    ["1,00,000", 100000],
    ["0.01", 0.01],
    ["9,99,99,999.99", 99999999.99],
    ["1234.5 Cr", -1234.5],
    ["  1,000.50  ", 1000.5],
    ["100.00 Dr", 100],
    ["-500 Cr", 500],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)} -> ${expected}`, () => {
      expect(parseTallyAmount(input)).toBe(expected);
    });
  }

  it("treats undefined and null as zero", () => {
    expect(parseTallyAmount(undefined as unknown as string)).toBe(0);
    expect(parseTallyAmount(null as unknown as string)).toBe(0);
  });

  it("treats a whitespace-only string as zero", () => {
    expect(parseTallyAmount("   ")).toBe(0);
  });

  it("throws TallyAmountParseError on non-numeric input", () => {
    expect(() => parseTallyAmount("abc")).toThrow(TallyAmountParseError);
    expect(() => parseTallyAmount("12.34.56")).toThrow(TallyAmountParseError);
  });

  it("error extends TallyXmlError and carries the offending input", () => {
    let caught: unknown;
    try {
      parseTallyAmount("xyz");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TallyXmlError);
    expect(caught).toBeInstanceOf(TallyAmountParseError);
    expect((caught as TallyAmountParseError).input).toBe("xyz");
  });
});
