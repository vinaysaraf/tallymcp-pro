import { describe, expect, it } from "vitest";
import { ConfigSchema, TallyConnectionSchema } from "../src/schema.js";

describe("ConfigSchema defaults", () => {
  it("applies safe defaults when given an empty object", () => {
    const config = ConfigSchema.parse({});
    expect(config.security.readOnly).toBe(true); // C-R2 default
    expect(config.tally.connections).toHaveLength(1);
    expect(config.tally.connections[0]?.host).toBe("127.0.0.1");
    expect(config.tally.connections[0]?.port).toBe(9000);
    expect(config.output.folder).toBe("./tallymcp-output");
    expect(config.schemaVersion).toBe(1);
  });

  it("preserves a non-default readOnly value", () => {
    expect(ConfigSchema.parse({ security: { readOnly: false } }).security.readOnly).toBe(false);
  });

  it("validates defaultFinancialYear when present", () => {
    expect(
      ConfigSchema.safeParse({
        tally: { defaultFinancialYear: { from: "2026-04-01", to: "20270331" } },
      }).success,
    ).toBe(false);
    expect(
      ConfigSchema.parse({
        tally: { defaultFinancialYear: { from: "20260401", to: "20270331" } },
      }).tally.defaultFinancialYear,
    ).toEqual({ from: "20260401", to: "20270331" });
  });

  it("accepts a defaultCompany string", () => {
    expect(
      ConfigSchema.parse({ tally: { defaultCompany: "10000 - Acme" } }).tally.defaultCompany,
    ).toBe("10000 - Acme");
  });
});

describe("TallyConnectionSchema", () => {
  it("defaults to a local Tally connection", () => {
    const c = TallyConnectionSchema.parse({});
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(9000);
    expect(c.type).toBe("local");
  });

  it("rejects an out-of-range port", () => {
    expect(TallyConnectionSchema.safeParse({ port: 0 }).success).toBe(false);
    expect(TallyConnectionSchema.safeParse({ port: 70000 }).success).toBe(false);
  });

  it("rejects an unknown connection type", () => {
    expect(TallyConnectionSchema.safeParse({ type: "cloud" }).success).toBe(false);
  });

  it("accepts a custom LAN connection", () => {
    expect(
      TallyConnectionSchema.parse({
        name: "Office Tally",
        host: "192.168.1.50",
        port: 9000,
        type: "lan",
      }).type,
    ).toBe("lan");
  });
});
