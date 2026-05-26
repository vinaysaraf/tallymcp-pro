import { describe, it, expect } from "vitest";
import { mergeMcpServers, removeMcpServer } from "../src/merge.js";
import type { McpServerEntry } from "../src/types.js";

const ENTRY: McpServerEntry = {
  command: "C:\\node.exe",
  args: ["C:\\main.js"],
  env: { TALLYMCP_CONFIG: "C:\\config.json" },
};

describe("mergeMcpServers", () => {
  it("adds tallymcp-pro to an empty config", () => {
    const merged = mergeMcpServers({}, ENTRY);
    expect(merged.mcpServers?.["tallymcp-pro"]).toEqual(ENTRY);
  });

  it("preserves other servers byte-identical", () => {
    const existing = {
      mcpServers: {
        "other-server": { command: "/usr/bin/python", args: ["script.py"] },
      },
    };
    const merged = mergeMcpServers(existing, ENTRY);
    expect(merged.mcpServers?.["other-server"]).toEqual(existing.mcpServers["other-server"]);
    expect(merged.mcpServers?.["tallymcp-pro"]).toEqual(ENTRY);
  });

  it("preserves top-level keys outside mcpServers", () => {
    const existing = { theme: "dark", mcpServers: {} };
    const merged = mergeMcpServers(existing, ENTRY) as Record<string, unknown>;
    expect(merged.theme).toBe("dark");
  });

  it("updates an existing tallymcp-pro entry rather than duplicating", () => {
    const existing = {
      mcpServers: { "tallymcp-pro": { command: "old.exe", args: [] } },
    };
    const merged = mergeMcpServers(existing, ENTRY);
    expect(merged.mcpServers?.["tallymcp-pro"]).toEqual(ENTRY);
    expect(Object.keys(merged.mcpServers ?? {})).toEqual(["tallymcp-pro"]);
  });

  it("creates mcpServers when absent", () => {
    const existing = { theme: "light" };
    const merged = mergeMcpServers(existing, ENTRY);
    expect(merged.mcpServers?.["tallymcp-pro"]).toEqual(ENTRY);
  });
});

describe("removeMcpServer", () => {
  it("removes tallymcp-pro and leaves siblings", () => {
    const existing = {
      mcpServers: {
        "tallymcp-pro": ENTRY,
        "other": { command: "x", args: [] },
      },
    };
    const updated = removeMcpServer(existing);
    expect(updated.mcpServers?.["tallymcp-pro"]).toBeUndefined();
    expect(updated.mcpServers?.["other"]).toEqual(existing.mcpServers.other);
  });

  it("is a no-op when key not present", () => {
    const existing = { mcpServers: { other: { command: "x", args: [] } } };
    const updated = removeMcpServer(existing);
    expect(updated).toEqual(existing);
  });

  it("preserves top-level keys", () => {
    const existing = { theme: "dark", mcpServers: { "tallymcp-pro": ENTRY } };
    const updated = removeMcpServer(existing) as Record<string, unknown>;
    expect(updated.theme).toBe("dark");
  });
});
