import { describe, it, expect } from "vitest";
import { assertValidClient } from "../src/main.js";

describe("assertValidClient", () => {
  it("returns valid ClientId when input matches a known client", () => {
    expect(assertValidClient("claude-desktop")).toBe("claude-desktop");
    expect(assertValidClient("cursor")).toBe("cursor");
    expect(assertValidClient("claude-code")).toBe("claude-code");
    expect(assertValidClient("lm-studio")).toBe("lm-studio");
    expect(assertValidClient("ollama")).toBe("ollama");
  });

  it("throws with a friendly message for an unknown client", () => {
    expect(() => assertValidClient("claude-desktopk")).toThrow(
      /Unknown AI client "claude-desktopk"/,
    );
  });

  it("error message includes valid options list", () => {
    expect(() => assertValidClient("badclient")).toThrow(/Valid options:/);
  });
});
