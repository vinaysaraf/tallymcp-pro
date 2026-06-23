import { describe, expect, it } from "vitest";
import { verifyCompanyMatch } from "../src/context.js";

describe("verifyCompanyMatch (company-verification guard)", () => {
  it("is a no-op when Tally serves exactly the requested company", () => {
    expect(() => verifyCompanyMatch("Acme Industries Pvt Ltd", "Acme Industries Pvt Ltd")).not.toThrow();
  });

  it("throws on a definitive mismatch (refuses another company's data)", () => {
    expect(() => verifyCompanyMatch("Requested Co", "Active Co")).toThrow(
      /served company "Active Co", not "Requested Co"/,
    );
  });

  it("is a no-op when the probe returns no company (older/transient Tally)", () => {
    // Empty actual must NOT block a legitimate request — graceful degradation.
    expect(() => verifyCompanyMatch("Requested Co", "")).not.toThrow();
  });
});
