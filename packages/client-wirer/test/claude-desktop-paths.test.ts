import { describe, it, expect } from "vitest";
import { sep } from "node:path";
import { resolveClaudeDesktopConfigPaths } from "../src/claude-desktop-paths.js";

interface FakeFs {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
}

function makeFs(map: Record<string, string[] | true>): FakeFs {
  // map keys are absolute paths; value is either `true` (file exists) or
  // an array of children (directory exists with those entries). Any path
  // not in the map is treated as missing.
  return {
    existsSync: (p: string): boolean => p in map,
    readdirSync: (p: string): string[] => {
      const v = map[p];
      if (!Array.isArray(v)) throw new Error(`readdirSync called on non-dir: ${p}`);
      return v;
    },
  };
}

const ENV = {
  APPDATA: "C:\\Users\\me\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
};

const p = (...segs: string[]): string => segs.join(sep);

describe("resolveClaudeDesktopConfigPaths", () => {
  it("returns standard-only when only %APPDATA%\\Claude exists and no MSIX packages", () => {
    const fs = makeFs({
      [p("C:", "Users", "me", "AppData", "Roaming", "Claude")]: [],
    });
    const result = resolveClaudeDesktopConfigPaths(ENV, fs);
    expect(result).toEqual([
      {
        path: p("C:", "Users", "me", "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
        variant: "standard",
      },
    ]);
  });

  it("returns msix-only when standard Claude folder is absent but MSIX sandbox exists", () => {
    const fs = makeFs({
      [p("C:", "Users", "me", "AppData", "Local", "Packages")]: ["Claude_pzs8sxrjxfjjc", "OtherApp_abc123"],
      [p("C:", "Users", "me", "AppData", "Local", "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude")]: [],
    });
    const result = resolveClaudeDesktopConfigPaths(ENV, fs);
    expect(result).toEqual([
      {
        path: p("C:", "Users", "me", "AppData", "Local", "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"),
        variant: "msix",
      },
    ]);
  });

  it("returns BOTH when standard + MSIX both exist", () => {
    const fs = makeFs({
      [p("C:", "Users", "me", "AppData", "Roaming", "Claude")]: [],
      [p("C:", "Users", "me", "AppData", "Local", "Packages")]: ["Claude_pzs8sxrjxfjjc"],
      [p("C:", "Users", "me", "AppData", "Local", "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude")]: [],
    });
    const result = resolveClaudeDesktopConfigPaths(ENV, fs);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.variant === "standard")?.path).toContain("Roaming");
    expect(result.find((r) => r.variant === "msix")?.path).toContain("Packages");
  });

  it("returns standard fallback when NEITHER path exists (so first-run write creates standard)", () => {
    const fs = makeFs({});
    const result = resolveClaudeDesktopConfigPaths(ENV, fs);
    expect(result).toEqual([
      {
        path: p("C:", "Users", "me", "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
        variant: "standard",
      },
    ]);
  });

  it("returns multiple MSIX entries when several Claude_* packages are installed", () => {
    const fs = makeFs({
      [p("C:", "Users", "me", "AppData", "Local", "Packages")]: [
        "Claude_pzs8sxrjxfjjc",
        "Claude_abcdef1234567",
      ],
      [p("C:", "Users", "me", "AppData", "Local", "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude")]: [],
      [p("C:", "Users", "me", "AppData", "Local", "Packages", "Claude_abcdef1234567", "LocalCache", "Roaming", "Claude")]: [],
    });
    const result = resolveClaudeDesktopConfigPaths(ENV, fs);
    expect(result.filter((r) => r.variant === "msix")).toHaveLength(2);
  });

  it("throws when APPDATA is missing from env", () => {
    const fs = makeFs({});
    expect(() => resolveClaudeDesktopConfigPaths({}, fs)).toThrow(/APPDATA/);
  });
});
