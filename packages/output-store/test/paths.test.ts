import { describe, it, expect } from "vitest";
import { isAbsolute } from "node:path";
import { resolveOutputDir, compactStamp } from "../src/index.js";

// Platform-appropriate absolute path + home so assertions hold on win32 and posix.
const HOME = process.platform === "win32" ? "C:\\Users\\test" : "/home/test";
const ABS = process.platform === "win32" ? "C:\\TallyMCP" : "/srv/tallymcp";

describe("resolveOutputDir", () => {
  it("resolves a relative folder against the home dir (absolute, under home, keeps the name)", () => {
    const r = resolveOutputDir("./tallymcp-output", HOME);
    expect(isAbsolute(r)).toBe(true);
    expect(r.startsWith(HOME)).toBe(true);
    expect(r.endsWith("tallymcp-output")).toBe(true);
  });

  it("resolves a bare relative folder the same way", () => {
    const r = resolveOutputDir("tallymcp-output", HOME);
    expect(isAbsolute(r)).toBe(true);
    expect(r.startsWith(HOME)).toBe(true);
  });

  it("returns an absolute folder unchanged (respects a user override)", () => {
    expect(resolveOutputDir(ABS, HOME)).toBe(ABS);
  });
});

describe("compactStamp", () => {
  it("compacts an ISO timestamp to YYYYMMDD-HHMMSS", () => {
    expect(compactStamp("2026-05-27T06:25:04.368Z")).toBe("20260527-062504");
  });

  it("falls back to a colon/dot-stripped form for non-ISO input", () => {
    expect(compactStamp("not:an.iso")).toBe("not-an-iso");
  });
});
