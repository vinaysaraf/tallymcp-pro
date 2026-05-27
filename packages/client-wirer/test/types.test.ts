import { describe, it, expect } from "vitest";
import { McpServerEntrySchema, type McpServerEntry, type WireResult, type UnwireResult } from "../src/types.js";

describe("McpServerEntrySchema", () => {
  it("accepts a valid entry", () => {
    const entry: McpServerEntry = {
      command: "C:\\Users\\me\\AppData\\Local\\TallyMCP\\node.exe",
      args: ["C:\\Users\\me\\AppData\\Local\\TallyMCP\\mcp-server\\main.js"],
      env: { TALLYMCP_CONFIG: "C:\\Users\\me\\AppData\\Local\\TallyMCP\\config.json" },
    };
    expect(McpServerEntrySchema.parse(entry)).toEqual(entry);
  });

  it("rejects an entry with empty command", () => {
    expect(() =>
      McpServerEntrySchema.parse({ command: "", args: [], env: {} })
    ).toThrow();
  });

  it("makes env optional", () => {
    const minimal = { command: "node.exe", args: ["main.js"] };
    expect(McpServerEntrySchema.parse(minimal).env).toBeUndefined();
  });
});

describe("v1.0.3 WireResult/UnwireResult shape", () => {
  it("WireResult carries configPaths array + variants", () => {
    const wr: WireResult = {
      clientId: "claude-desktop",
      configPath: "C:\\a.json",
      configPaths: ["C:\\a.json", "C:\\b.json"],
      variants: ["standard", "msix"],
      backupCreated: true,
      action: "added",
    };
    expect(wr.configPaths).toHaveLength(2);
    expect(wr.variants).toEqual(["standard", "msix"]);
  });

  it("UnwireResult carries configPaths array", () => {
    const ur: UnwireResult = {
      clientId: "claude-desktop",
      configPath: "C:\\a.json",
      configPaths: ["C:\\a.json"],
      action: "removed",
    };
    expect(ur.configPaths).toEqual(["C:\\a.json"]);
  });
});
