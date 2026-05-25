import { describe, it, expect } from "vitest";
import { CLIENT_REGISTRY, resolveClientConfigPath } from "../src/clients.js";

describe("CLIENT_REGISTRY", () => {
  it("contains exactly the 5 supported clients", () => {
    expect(Object.keys(CLIENT_REGISTRY).sort()).toEqual([
      "claude-code",
      "claude-desktop",
      "cursor",
      "lm-studio",
      "ollama",
    ]);
  });

  it("each entry has a displayName and a configPath template", () => {
    for (const id of Object.keys(CLIENT_REGISTRY) as Array<keyof typeof CLIENT_REGISTRY>) {
      expect(CLIENT_REGISTRY[id].displayName).toMatch(/.+/);
      expect(CLIENT_REGISTRY[id].configPathTemplate).toMatch(/\$\{[A-Z_]+\}/);
    }
  });
});

describe("resolveClientConfigPath", () => {
  const ENV = {
    APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    USERPROFILE: "C:\\Users\\me",
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
  };

  it("expands Claude Desktop path", () => {
    expect(resolveClientConfigPath("claude-desktop", ENV)).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
    );
  });

  it("expands Cursor path", () => {
    expect(resolveClientConfigPath("cursor", ENV)).toBe(
      "C:\\Users\\me\\.cursor\\mcp.json",
    );
  });

  it("expands Claude Code path", () => {
    expect(resolveClientConfigPath("claude-code", ENV)).toBe(
      "C:\\Users\\me\\.claude.json",
    );
  });

  it("expands LM Studio path", () => {
    expect(resolveClientConfigPath("lm-studio", ENV)).toBe(
      "C:\\Users\\me\\.lmstudio\\mcp.json",
    );
  });

  it("expands Ollama bridge path", () => {
    expect(resolveClientConfigPath("ollama", ENV)).toBe(
      "C:\\Users\\me\\AppData\\Local\\TallyMCP\\ollama-bridge\\config.json",
    );
  });

  it("throws when an env var the template needs is missing", () => {
    expect(() => resolveClientConfigPath("claude-desktop", {})).toThrow(/APPDATA/);
  });
});
