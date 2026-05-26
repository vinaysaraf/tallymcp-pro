// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getApi, type WindowWithTallyMcp } from "../../src/renderer/api.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var window: any;
}

describe("getApi", () => {
  beforeEach(() => {
    delete (globalThis.window as WindowWithTallyMcp).tallymcp;
  });

  it("returns window.tallymcp when injected", () => {
    const fake = { wireMcp: vi.fn(), unwireMcp: vi.fn() } as unknown;
    (globalThis.window as WindowWithTallyMcp).tallymcp = fake as never;
    expect(getApi()).toBe(fake);
  });

  it("throws a clear error when the preload bridge isn't installed", () => {
    expect(() => getApi()).toThrow(
      /tallymcp API not available.*preload/i,
    );
  });
});
