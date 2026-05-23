import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../src/resolve-period.js";

const indianFyCompany = { startingFrom: "20240401" } as const;
const calendarYearCompany = { startingFrom: "20240101" } as const;

describe("resolvePeriod", () => {
  it("returns explicit fromDate + toDate when both are supplied", () => {
    expect(
      resolvePeriod(indianFyCompany, { fromDate: "20250401", toDate: "20260331" }),
    ).toEqual({ from: "20250401", to: "20260331" });
  });

  it("uses defaultFinancialYear when no explicit dates are passed", () => {
    expect(
      resolvePeriod(indianFyCompany, {
        defaultFinancialYear: { from: "20240401", to: "20250331" },
        asOf: new Date(2026, 4, 23), // May 23 2026 — should be ignored
      }),
    ).toEqual({ from: "20240401", to: "20250331" });
  });

  it("computes the current Indian FY from asOf in mid-FY", () => {
    expect(resolvePeriod(indianFyCompany, { asOf: new Date(2026, 4, 23) })).toEqual({
      from: "20260401",
      to: "20270331",
    });
  });

  it("computes the previous Indian FY when asOf is in Q4", () => {
    expect(resolvePeriod(indianFyCompany, { asOf: new Date(2026, 1, 15) })).toEqual({
      from: "20250401",
      to: "20260331",
    });
  });

  it("treats Apr 1 as the inclusive start of the new FY", () => {
    expect(resolvePeriod(indianFyCompany, { asOf: new Date(2026, 3, 1) })).toEqual({
      from: "20260401",
      to: "20270331",
    });
  });

  it("treats Mar 31 as the last day of the old FY", () => {
    expect(resolvePeriod(indianFyCompany, { asOf: new Date(2026, 2, 31) })).toEqual({
      from: "20250401",
      to: "20260331",
    });
  });

  it("honors a calendar-year FY from company.startingFrom", () => {
    expect(resolvePeriod(calendarYearCompany, { asOf: new Date(2026, 4, 23) })).toEqual({
      from: "20260101",
      to: "20261231",
    });
  });

  it("defaults to Indian FY when no company is supplied", () => {
    expect(resolvePeriod(undefined, { asOf: new Date(2026, 4, 23) })).toEqual({
      from: "20260401",
      to: "20270331",
    });
  });

  it("rejects a partial range (only fromDate)", () => {
    expect(() =>
      resolvePeriod(indianFyCompany, { fromDate: "20260401" }),
    ).toThrow(/fromDate and toDate/);
  });

  it("rejects a partial range (only toDate)", () => {
    expect(() =>
      resolvePeriod(indianFyCompany, { toDate: "20270331" }),
    ).toThrow(/fromDate and toDate/);
  });
});
