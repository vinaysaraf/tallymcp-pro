import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UpdateStatus } from "../../src/shared/ipc-types.js";

// Mock electron-updater BEFORE importing the module under test.
// We capture the autoUpdater event handlers and the mock methods so each
// test can drive the state machine through realistic transitions.
//
// vi.mock() calls are hoisted to the top of the file by Vitest, which
// means a plain `const autoUpdaterMock = { on: vi.fn(), ... }` declared
// after the import block would be in the temporal dead zone when the
// factory runs. Using vi.hoisted() lifts the object initialiser into
// the same hoisted zone so the factory can safely reference it.
const autoUpdaterMock = vi.hoisted(() => ({
  on: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  setFeedURL: vi.fn(),
  autoDownload: false as boolean,
  autoInstallOnAppQuit: false as boolean,
  currentVersion: { version: "1.0.0" },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

// Re-import after mocks are set up.
import { createAutoUpdater } from "../../src/main/auto-update.js";

describe("createAutoUpdater", () => {
  beforeEach(() => {
    autoUpdaterMock.on.mockReset();
    autoUpdaterMock.checkForUpdates.mockReset();
    autoUpdaterMock.downloadUpdate.mockReset();
    autoUpdaterMock.quitAndInstall.mockReset();
    autoUpdaterMock.setFeedURL.mockReset();
    autoUpdaterMock.autoDownload = false;
    autoUpdaterMock.autoInstallOnAppQuit = false;
  });

  it("initial status is up-to-date with the installed version", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    expect(u.getStatus()).toEqual({
      status: "up-to-date",
      currentVersion: "1.0.0",
    });
  });

  it("disables auto-download and auto-install (user-clicks-Update UX)", () => {
    createAutoUpdater({ currentVersion: "1.0.0" });
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
  });

  it("transitions to update-available when autoUpdater emits update-available", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    const onCalls = autoUpdaterMock.on.mock.calls;
    const handler = onCalls.find((c) => c[0] === "update-available")?.[1];
    expect(handler).toBeDefined();

    const emitted: UpdateStatus[] = [];
    u.subscribe((s) => emitted.push(s));

    handler!({ version: "1.1.0", releaseNotes: "Cool new stuff" });

    expect(u.getStatus()).toEqual({
      status: "update-available",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseNotesUrl: "https://github.com/vinaysaraf/tallymcp-pro/releases/tag/v1.1.0",
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.status).toBe("update-available");
  });

  it("transitions to downloading with progress when download-progress fires", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    const onCalls = autoUpdaterMock.on.mock.calls;
    const availableHandler = onCalls.find((c) => c[0] === "update-available")?.[1];
    const progressHandler = onCalls.find((c) => c[0] === "download-progress")?.[1];

    availableHandler!({ version: "1.1.0" });
    progressHandler!({ percent: 42 });

    expect(u.getStatus().status).toBe("downloading");
    expect(u.getStatus().downloadProgress).toBeCloseTo(0.42, 2);
    expect(u.getStatus().latestVersion).toBe("1.1.0");
  });

  it("transitions to ready-to-install when update-downloaded fires", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    const onCalls = autoUpdaterMock.on.mock.calls;
    const availableHandler = onCalls.find((c) => c[0] === "update-available")?.[1];
    const downloadedHandler = onCalls.find((c) => c[0] === "update-downloaded")?.[1];

    availableHandler!({ version: "1.1.0" });
    downloadedHandler!({ version: "1.1.0" });

    expect(u.getStatus().status).toBe("ready-to-install");
    expect(u.getStatus().latestVersion).toBe("1.1.0");
  });

  it("transitions to error and exposes the message when autoUpdater errors", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    const errorHandler = autoUpdaterMock.on.mock.calls.find((c) => c[0] === "error")?.[1];

    errorHandler!(new Error("network unreachable"));

    expect(u.getStatus().status).toBe("error");
    expect(u.getStatus().error).toBe("network unreachable");
    expect(u.getStatus().currentVersion).toBe("1.0.0");
  });

  it("checkForUpdates() returns the resolved status after a successful check", async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValueOnce({
      updateInfo: { version: "1.0.0" },
    });
    const u = createAutoUpdater({ currentVersion: "1.0.0" });

    const result = await u.checkForUpdates();

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalled();
    expect(result.status).toBe("up-to-date");
  });

  it("downloadUpdate() calls autoUpdater.downloadUpdate and returns immediately (no quitAndInstall)", async () => {
    autoUpdaterMock.downloadUpdate.mockResolvedValueOnce(["TallyMCP-Setup-v1.1.0.exe"]);
    const u = createAutoUpdater({ currentVersion: "1.0.0" });

    await u.downloadUpdate();

    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalled();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("downloadUpdate() captures rejection into the error state instead of throwing", async () => {
    autoUpdaterMock.downloadUpdate.mockRejectedValueOnce(new Error("disk full"));
    const u = createAutoUpdater({ currentVersion: "1.0.0" });

    // Should not throw — the helper swallows the rejection into the state
    // machine so the renderer can surface it via subscribeUpdateStatus.
    await expect(u.downloadUpdate()).resolves.toBeUndefined();
    expect(u.getStatus().status).toBe("error");
    expect(u.getStatus().error).toContain("disk full");
  });

  it("quitAndInstall() only invokes autoUpdater.quitAndInstall when status is ready-to-install", () => {
    const u = createAutoUpdater({ currentVersion: "1.0.0" });
    const onCalls = autoUpdaterMock.on.mock.calls;
    const downloadedHandler = onCalls.find((c) => c[0] === "update-downloaded")?.[1];

    // Before download → no-op.
    u.quitAndInstall();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();

    // Transition to ready-to-install via the event handler.
    downloadedHandler!({ version: "1.1.0" });
    expect(u.getStatus().status).toBe("ready-to-install");

    u.quitAndInstall();
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
