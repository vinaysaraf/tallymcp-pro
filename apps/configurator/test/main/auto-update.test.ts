import { describe, it, expect } from "vitest";
import { checkForUpdatesStub } from "../../src/main/auto-update.js";

describe("checkForUpdatesStub", () => {
  it("returns 'up-to-date' as the Phase 2 stub", async () => {
    const result = await checkForUpdatesStub();
    expect(result.status).toBe("up-to-date");
    expect(result.currentVersion).toBeTruthy();
  });
});
