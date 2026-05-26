import { Readable } from "node:stream";
import { describe, it, expect, afterEach } from "vitest";
import { AbortError, assertInteractiveOrYes, formatPreview, readStdinConfirm } from "../src/confirm.js";

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

describe("readStdinConfirm", () => {
  const origStdin = process.stdin;
  const origWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: origStdin, configurable: true });
    process.stdout.write = origWrite;
  });

  function mockStdin(input: string): void {
    const fakeStream = Readable.from([input]);
    Object.defineProperty(process, "stdin", { value: fakeStream, configurable: true });
    // Suppress the prompt output during tests.
    process.stdout.write = (_chunk: unknown, ..._rest: unknown[]) => true;
  }

  it("returns true for 'y'", async () => {
    mockStdin("y\n");
    expect(await readStdinConfirm("Proceed? ")).toBe(true);
  });

  it("returns true for 'YES'", async () => {
    mockStdin("YES\n");
    expect(await readStdinConfirm("Proceed? ")).toBe(true);
  });

  it("returns false for empty input", async () => {
    mockStdin("\n");
    expect(await readStdinConfirm("Proceed? ")).toBe(false);
  });

  it("returns false for 'n'", async () => {
    mockStdin("n\n");
    expect(await readStdinConfirm("Proceed? ")).toBe(false);
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
