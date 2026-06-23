import { describe, expect, it } from "vitest";
import { getCurrentCompany } from "../src/connectors/index.js";
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
});
