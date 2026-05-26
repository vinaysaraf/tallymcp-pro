import { describe, it, expect, afterEach } from "vitest";
import { AbortError, assertInteractiveOrYes, formatPreview } from "../src/confirm.js";

describe("AbortError", () => {
  it("extends Error and has correct name", () => {
    const err = new AbortError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AbortError");
  });

  it("accepts a custom message", () => {
    const err = new AbortError("Custom abort message");
    expect(err.message).toBe("Custom abort message");
  });
});

describe("assertInteractiveOrYes", () => {
  const originalIsTTY = process.stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it("no-op when yes is true (regardless of TTY state)", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    // Should not throw
    expect(() => assertInteractiveOrYes({ yes: true })).not.toThrow();
  });

  it("throws when yes is false AND stdin is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    expect(() => assertInteractiveOrYes({ yes: false })).toThrow(
      "stdin is not a terminal. Re-run with --yes (-y) to apply changes without a prompt.",
    );
  });
});

describe("formatPreview", () => {
  it("renders title and numbered items with indent", () => {
    const out = formatPreview("I will make 2 changes:", ["Do thing A", "Do thing B"]);
    expect(out).toContain("I will make 2 changes:");
    expect(out).toContain("  1. Do thing A");
    expect(out).toContain("  2. Do thing B");
  });

  it("indents multiline items on every line", () => {
    const out = formatPreview("Preview:", ["Line one\nLine two"]);
    expect(out).toContain("  1. Line one");
    expect(out).toContain("  Line two");
  });
});
