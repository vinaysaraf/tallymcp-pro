import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/store.js";

let scratchDir: string;
let configPath: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "tallymcp-config-"));
  configPath = join(scratchDir, "config.json");
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("ConfigStore", () => {
  it("returns defaults when no config file exists", async () => {
    const store = new ConfigStore(configPath);
    const config = await store.load();
    expect(config.security.readOnly).toBe(true);
    expect(config.tally.connections[0]?.port).toBe(9000);
  });

  it("loads and validates an existing config file", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ tally: { defaultCompany: "Acme" }, security: { readOnly: false } }),
      "utf8",
    );
    const config = await new ConfigStore(configPath).load();
    expect(config.tally.defaultCompany).toBe("Acme");
    expect(config.security.readOnly).toBe(false);
  });

  it("throws a readable error for invalid JSON", async () => {
    writeFileSync(configPath, "{not-json", "utf8");
    await expect(new ConfigStore(configPath).load()).rejects.toThrow(/invalid JSON/i);
  });

  it("throws a readable error when Zod validation fails", async () => {
    writeFileSync(configPath, JSON.stringify({ tally: { connections: [{ port: 70000 }] } }), "utf8");
    await expect(new ConfigStore(configPath).load()).rejects.toThrow(/config/i);
  });

  it("update() merges a patch and persists the result to disk", async () => {
    const store = new ConfigStore(configPath);
    await store.load();
    const next = await store.update({ tally: { defaultCompany: "Beta" } });
    expect(next.tally.defaultCompany).toBe("Beta");
    expect(next.security.readOnly).toBe(true); // unchanged default
    const reread = await new ConfigStore(configPath).load();
    expect(reread.tally.defaultCompany).toBe("Beta");
  });

  it("update() validates the merged result", async () => {
    const store = new ConfigStore(configPath);
    await store.load();
    await expect(
      // @ts-expect-error — intentionally bad patch
      store.update({ tally: { connections: [{ port: -1 }] } }),
    ).rejects.toThrow();
  });

  it("save() round-trips a full config", async () => {
    const store = new ConfigStore(configPath);
    await store.load();
    await store.save({
      schemaVersion: 1,
      tally: {
        connections: [{ name: "Office", host: "192.168.1.50", port: 9000, type: "lan" }],
        defaultCompany: "Office Co",
        defaultFinancialYear: { from: "20260401", to: "20270331" },
      },
      output: { folder: "./out" },
      security: { readOnly: true },
    });
    const reread = JSON.parse(readFileSync(configPath, "utf8"));
    expect(reread.tally.connections[0].host).toBe("192.168.1.50");
    expect(reread.tally.defaultFinancialYear.to).toBe("20270331");
  });

  it("get() returns the cached config without re-reading disk", async () => {
    const store = new ConfigStore(configPath);
    await store.load();
    writeFileSync(configPath, JSON.stringify({ security: { readOnly: false } }), "utf8");
    // get() must reflect the *cached* value, not the on-disk edit
    expect(store.get().security.readOnly).toBe(true);
  });

  it("get() throws before load() is called", () => {
    const store = new ConfigStore(configPath);
    expect(() => store.get()).toThrow(/load/);
  });
});
