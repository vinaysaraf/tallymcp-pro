import { describe, it, expect } from "vitest";
import * as pkg from "../src/index.js";

describe("client-wirer package", () => {
  it("loads", () => {
    expect(pkg).toBeDefined();
  });
});
