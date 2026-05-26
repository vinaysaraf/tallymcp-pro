import { describe, it, expect } from "vitest";
import { generateLatestJson } from "./generate-latest-json.mjs";

describe("generateLatestJson", () => {
  it("produces a spec-format latest.json object from the given inputs", () => {
    const out = generateLatestJson({
      version: "1.0.0",
      sha256: "abc123def456",
      tag: "v1.0.0",
      owner: "vinaysaraf",
      repo: "tallymcp-pro",
      now: new Date("2026-06-01T12:00:00Z"),
    });
    expect(out).toEqual({
      version: "1.0.0",
      publishedAt: "2026-06-01T12:00:00.000Z",
      downloadUrl: "https://github.com/vinaysaraf/tallymcp-pro/releases/download/v1.0.0/TallyMCP-Setup-v1.0.0.exe",
      sha256: "abc123def456",
      minSupportedFromVersion: "1.0.0",
      releaseNotesUrl: "https://github.com/vinaysaraf/tallymcp-pro/releases/tag/v1.0.0",
    });
  });

  it("uses the provided minSupportedFromVersion when set", () => {
    const out = generateLatestJson({
      version: "1.2.0",
      sha256: "xyz",
      tag: "v1.2.0",
      owner: "vinaysaraf",
      repo: "tallymcp-pro",
      now: new Date("2026-06-01T12:00:00Z"),
      minSupportedFromVersion: "1.0.0",
    });
    expect(out.minSupportedFromVersion).toBe("1.0.0");
  });

  it("throws when tag doesn't equal v${version} (Cursor H2 guard)", () => {
    expect(() =>
      generateLatestJson({
        version: "0.0.1",
        sha256: "abc",
        tag: "v1.0.0", // mismatch — should reject
        owner: "vinaysaraf",
        repo: "tallymcp-pro",
        now: new Date("2026-06-01T12:00:00Z"),
      }),
    ).toThrow(/tag\/version mismatch/);
  });
});
