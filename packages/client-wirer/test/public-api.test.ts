import { describe, it, expect } from "vitest";
import {
  ClientWirer,
  CLIENT_REGISTRY,
  resolveClientConfigPath,
  McpServerEntrySchema,
  type ClientId,
  type McpServerEntry,
  type WireResult,
  type UnwireResult,
} from "../src/index.js";

describe("public API", () => {
  it("exports ClientWirer class", () => {
    expect(typeof ClientWirer).toBe("function");
  });
  it("exports CLIENT_REGISTRY with 5 clients", () => {
    expect(Object.keys(CLIENT_REGISTRY)).toHaveLength(5);
  });
  it("exports resolveClientConfigPath function", () => {
    expect(typeof resolveClientConfigPath).toBe("function");
  });
  it("exports McpServerEntrySchema", () => {
    expect(typeof McpServerEntrySchema.parse).toBe("function");
  });
  it("compiles the public type imports", () => {
    const id: ClientId = "claude-desktop";
    const entry: McpServerEntry = { command: "x", args: [] };
    const wire: WireResult = {
      clientId: id,
      configPath: "x",
      configPaths: ["x"],
      variants: ["standard"],
      backupCreated: false,
      action: "added",
    };
    const unwire: UnwireResult = {
      clientId: id,
      configPath: "x",
      configPaths: ["x"],
      action: "noop",
    };
    expect(id && entry && wire && unwire).toBeTruthy();
  });
});
