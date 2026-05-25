import { describe, it, expect } from "vitest";
import { createProgram } from "../src/main.js";

describe("@tallymcp/cli", () => {
  it("createProgram returns a configured commander instance", () => {
    const program = createProgram();
    expect(program.name()).toBe("tallymcp-cli");
    expect(program.version()).toBe("0.0.1");
  });
});
