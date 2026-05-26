import { describe, it, expect } from "vitest";
import * as pkg from "../src/index.js";

describe("tally-autofix package", () => {
  it("loads", () => {
    expect(pkg).toBeDefined();
  });
});
