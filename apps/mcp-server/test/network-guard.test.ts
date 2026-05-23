import { describe, expect, it } from "vitest";
import { createNetworkGuard, NetworkGuardError } from "../src/network-guard.js";

const guard = createNetworkGuard({ host: "127.0.0.1", port: 9000 });

describe("createNetworkGuard", () => {
  it("allows the configured Tally host:port", () => {
    expect(guard.isAllowed("http://127.0.0.1:9000/")).toBe(true);
    expect(() => guard.assertAllowed("http://127.0.0.1:9000/path")).not.toThrow();
  });

  it("rejects requests to example.com", () => {
    expect(guard.isAllowed("https://example.com/")).toBe(false);
    expect(() => guard.assertAllowed("https://example.com/")).toThrow(NetworkGuardError);
  });

  it("rejects a different port on the same host", () => {
    expect(guard.isAllowed("http://127.0.0.1:8080/")).toBe(false);
  });

  it("rejects a different host on the same port", () => {
    expect(guard.isAllowed("http://192.168.1.1:9000/")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(guard.isAllowed("not-a-url")).toBe(false);
  });

  it("NetworkGuardError carries the attempted URL and allowed origin", () => {
    try {
      guard.assertAllowed("https://attacker.test/exfil");
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkGuardError);
      expect((e as NetworkGuardError).attemptedUrl).toContain("attacker.test");
      expect((e as NetworkGuardError).allowed).toEqual({ host: "127.0.0.1", port: 9000 });
    }
  });
});
