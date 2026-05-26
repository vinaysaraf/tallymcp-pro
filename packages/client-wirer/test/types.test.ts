import { describe, it, expect } from "vitest";
import { McpServerEntrySchema, type McpServerEntry } from "../src/types.js";

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
