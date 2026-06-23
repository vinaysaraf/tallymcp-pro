import { describe, expect, it } from "vitest";
import { getCurrentCompany, getLoadedPeriod } from "../src/connectors/index.js";
import type { TallyClient } from "../src/client.js";

function stubClient(response: string): TallyClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async post(xml: string) {
      calls.push(xml);
      return response;
    },
  };
}

describe("getCurrentCompany", () => {
  it("returns Tally's actual current company from $$CurrentCompany", async () => {
    const client = stubClient(
      `<ENVELOPE><BODY><DATA><ROW><CMP>Acme Industries Pvt Ltd</CMP></ROW></DATA></BODY></ENVELOPE>`,
    );
    const actual = await getCurrentCompany(client, "Acme Industries Pvt Ltd");
    expect(actual).toBe("Acme Industries Pvt Ltd");
    // The probe sets SVCURRENTCOMPANY to the requested company.
    expect(client.calls[0]).toContain("<SVCURRENTCOMPANY>Acme Industries Pvt Ltd</SVCURRENTCOMPANY>");
    expect(client.calls[0]).toContain("$$CurrentCompany");
  });

  it("surfaces a fallback company name when Tally serves a different one", async () => {
    // Requested B but Tally served the active company A → caller can detect it.
    const client = stubClient(
      `<ENVELOPE><BODY><DATA><ROW><CMP>Active Co A</CMP></ROW></DATA></BODY></ENVELOPE>`,
    );
    expect(await getCurrentCompany(client, "Requested Co B")).toBe("Active Co A");
  });

  it("returns an empty string when no current company is reported", async () => {
    const client = stubClient(`<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>`);
    expect(await getCurrentCompany(client, "Whatever")).toBe("");
  });

  it("throws on a Tally <LINEERROR> (definitive selection failure, not a silent no-op)", async () => {
    // If Tally returns "Could not find Company" with no <CMP>, the guard must
    // surface it as a hard failure — not fall through to the empty-string no-op.
    const client = stubClient(
      `<ENVELOPE><BODY><DATA><LINEERROR>Could not find Company</LINEERROR></DATA></BODY></ENVELOPE>`,
    );
    await expect(getCurrentCompany(client, "Ghost Co")).rejects.toThrow(/Could not find Company/);
  });
});

describe("getLoadedPeriod", () => {
  it("returns the loaded period as YYYYMMDD bounds (dashes stripped)", async () => {
    const client = stubClient(
      `<ENVELOPE><BODY><DATA><ROW><PFROM>2026-04-01</PFROM><PTO>2027-03-31</PTO></ROW></DATA></BODY></ENVELOPE>`,
    );
    expect(await getLoadedPeriod(client, "Acme")).toEqual({ from: "20260401", to: "20270331" });
    expect(client.calls[0]).toContain("TallyMcpCurrentPeriod");
  });

  it("returns null when Tally does not report a usable period", async () => {
    const client = stubClient(`<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>`);
    expect(await getLoadedPeriod(client, "Acme")).toBeNull();
  });
});
