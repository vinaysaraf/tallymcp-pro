import { describe, it, expect } from "vitest";
import { createMainWindowOptions, PRELOAD_RELATIVE_PATH } from "../../src/main/index.js";

describe("createMainWindowOptions", () => {
  it("returns a configured BrowserWindowConstructorOptions with security defaults", () => {
    const opts = createMainWindowOptions({ preloadAbsolutePath: "/abs/preload.js" });
    expect(opts.webPreferences?.preload).toBe("/abs/preload.js");
    expect(opts.webPreferences?.contextIsolation).toBe(true);
    expect(opts.webPreferences?.nodeIntegration).toBe(false);
    expect(opts.webPreferences?.sandbox).toBe(true);
    expect(opts.width).toBeGreaterThanOrEqual(900);
    expect(opts.height).toBeGreaterThanOrEqual(600);
  });

  it("exposes the preload relative path so build tooling can find it", () => {
    expect(PRELOAD_RELATIVE_PATH).toBe("../preload/index.js");
  });
});
