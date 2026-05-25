import { describe, it, expect } from "vitest";
import { AbortError, formatPreview } from "../src/confirm.js";

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
