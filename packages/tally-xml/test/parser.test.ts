import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findAll, nodeText, parseTallyBoolean, parseTallyResponse } from "../src/parser.js";

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../samples");
const listCompaniesResponse = readFileSync(
  join(samplesDir, "list-companies.response.xml"),
  "utf8",
);

describe("parseTallyResponse", () => {
  it("parses the List of Companies response with at least one company", () => {
    const { raw, lineErrors } = parseTallyResponse(listCompaniesResponse);
    expect(lineErrors).toEqual([]);
    expect(findAll(raw, "COMPANY").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps element attributes under the @_ prefix", () => {
    const { raw } = parseTallyResponse(listCompaniesResponse);
    const [company] = findAll(raw, "COMPANY") as Array<Record<string, unknown>>;
    expect(company?.["@_NAME"]).toBe("10000 - Acme Trading");
  });

  it("keeps numeric tag values as strings (parseTagValue off)", () => {
    const { raw } = parseTallyResponse(listCompaniesResponse);
    const [company] = findAll(raw, "COMPANY") as Array<Record<string, unknown>>;
    expect(company?.STARTINGFROM).toBe("20240401");
  });

  it("parses XML with no prolog and minified whitespace", () => {
    const { raw } = parseTallyResponse("<ENVELOPE><BODY><DATA><X>1</X></DATA></BODY></ENVELOPE>");
    expect(findAll(raw, "X")).toEqual(["1"]);
  });

  it("extracts LINEERROR messages from a soft-error response", () => {
    const xml =
      "<ENVELOPE><BODY><DATA><LINEERROR>Could not find Company</LINEERROR></DATA></BODY></ENVELOPE>";
    expect(parseTallyResponse(xml).lineErrors).toEqual(["Could not find Company"]);
  });

  it("reports no line errors for a clean response", () => {
    expect(parseTallyResponse(listCompaniesResponse).lineErrors).toEqual([]);
  });
});

describe("findAll", () => {
  it("collects every node under a repeated tag", () => {
    const { raw } = parseTallyResponse("<R><LEDGER>A</LEDGER><LEDGER>B</LEDGER></R>");
    expect(findAll(raw, "LEDGER")).toEqual(["A", "B"]);
  });

  it("returns a single-element array for a non-repeated tag", () => {
    const { raw } = parseTallyResponse("<R><LEDGER>Solo</LEDGER></R>");
    expect(findAll(raw, "LEDGER")).toEqual(["Solo"]);
  });

  it("returns an empty array when the tag is absent", () => {
    const { raw } = parseTallyResponse("<R><X>1</X></R>");
    expect(findAll(raw, "VOUCHER")).toEqual([]);
  });
});

describe("parseTallyBoolean", () => {
  const truthy = ["Yes", "yes", "YES", "true", "1"];
  const falsy = ["No", "no", "", "0", "maybe"];

  for (const v of truthy) {
    it(`parses ${JSON.stringify(v)} as true`, () => {
      expect(parseTallyBoolean(v)).toBe(true);
    });
  }
  for (const v of falsy) {
    it(`parses ${JSON.stringify(v)} as false`, () => {
      expect(parseTallyBoolean(v)).toBe(false);
    });
  }

  it("treats undefined as false", () => {
    expect(parseTallyBoolean(undefined as unknown as string)).toBe(false);
  });
});

describe("nodeText", () => {
  it("returns plain string and number values as strings", () => {
    expect(nodeText("Cash")).toBe("Cash");
    expect(nodeText(42)).toBe("42");
  });

  it("returns an empty string for null/undefined", () => {
    expect(nodeText(null)).toBe("");
    expect(nodeText(undefined)).toBe("");
  });

  it("unwraps #text from an attribute-carrying element (the [object Object] fix)", () => {
    // <OPENINGBALANCE TYPE="Dr">10,000.00</OPENINGBALANCE> →
    // { "@_TYPE": "Dr", "#text": "10,000.00" }
    expect(nodeText({ "@_TYPE": "Dr", "#text": "10,000.00" })).toBe("10,000.00");
  });

  it("returns an empty string for an attribute-only element (no #text)", () => {
    expect(nodeText({ "@_TYPE": "Dr" })).toBe("");
  });

  it("reads the first item of an array", () => {
    expect(nodeText(["a", "b"])).toBe("a");
    expect(nodeText([])).toBe("");
  });

  it("never yields the string \"[object Object]\"", () => {
    expect(nodeText({ "@_X": "1", "#text": "5" })).not.toBe("[object Object]");
  });
});
