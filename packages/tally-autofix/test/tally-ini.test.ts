import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTallyIni,
  serializeTallyIni,
  ensureXmlInterfaceLines,
} from "../src/tally-ini.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fresh = join(HERE, "fixtures", "tally-ini-fresh.ini");
const serverOnly = join(HERE, "fixtures", "tally-ini-with-server-only.ini");

describe("parseTallyIni", () => {
  it("parses keys from a fresh tally.ini", async () => {
    const text = await readFile(fresh, "utf8");
    const parsed = parseTallyIni(text);
    expect(parsed.get("Default Companies")).toBe("Yes");
    expect(parsed.get("Load")).toBe("10002");
    expect(parsed.get("Data")).toBe("C:\\Users\\me\\TallyData");
  });

  it("is case-insensitive on keys (Tally writes them inconsistently)", async () => {
    const text = await readFile(fresh, "utf8");
    const parsed = parseTallyIni(text);
    expect(parsed.get("DEFAULT COMPANIES")).toBe("Yes");
    expect(parsed.get("default companies")).toBe("Yes");
  });

  it("preserves keys we don't touch on round-trip", async () => {
    const text = await readFile(fresh, "utf8");
    const parsed = parseTallyIni(text);
    const out = serializeTallyIni(parsed);
    expect(out).toContain("Default Companies=Yes");
    expect(out).toContain("Load=10002");
    expect(out).toContain("Data=C:\\Users\\me\\TallyData");
    expect(out).toContain("TDL=C:\\Assignments\\Demo\\demo.tcp");
  });
});

describe("ensureXmlInterfaceLines", () => {
  it("adds Client Server=Both + ServerPort=9000 when absent", async () => {
    const text = await readFile(fresh, "utf8");
    const parsed = parseTallyIni(text);
    const updated = ensureXmlInterfaceLines(parsed);
    expect(updated.get("Client Server")).toBe("Both");
    expect(updated.get("ServerPort")).toBe("9000");
  });

  it("upgrades Client Server=Server to =Both, keeps the rest", async () => {
    const text = await readFile(serverOnly, "utf8");
    const parsed = parseTallyIni(text);
    const updated = ensureXmlInterfaceLines(parsed);
    expect(updated.get("Client Server")).toBe("Both");
    expect(updated.get("Default Companies")).toBe("Yes");
  });

  it("is idempotent when Client Server=Both already present", async () => {
    const text = "[TALLY]\nClient Server=Both\nServerPort=9000\n";
    const parsed = parseTallyIni(text);
    const updated = ensureXmlInterfaceLines(parsed);
    expect(updated.get("Client Server")).toBe("Both");
    expect(updated.get("ServerPort")).toBe("9000");
  });
});
