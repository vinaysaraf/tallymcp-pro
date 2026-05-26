import { describe, it, expect, vi } from "vitest";
import { buildTallymcpApi } from "../../src/preload/index.js";
import { IPC_CHANNELS, TALLY_STATUS_EVENT, UPDATE_STATUS_EVENT } from "../../src/shared/ipc-types.js";

describe("buildTallymcpApi", () => {
  it("invokes the correct channel for wireMcp", async () => {
    const invoke = vi.fn().mockResolvedValue({ action: "added" });
    const on = vi.fn();
    const api = buildTallymcpApi({ invoke, on });

    await api.wireMcp({ clientId: "claude-desktop" });

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.WIRE_MCP, {
      clientId: "claude-desktop",
    });
  });

  it("invokes the correct channel for healthCheck (no payload)", async () => {
    const invoke = vi.fn().mockResolvedValue({ tallyInstalled: true });
    const api = buildTallymcpApi({ invoke, on: vi.fn() });

    await api.healthCheck();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.HEALTH_CHECK);
  });

  it("subscribes to tally-status events and returns an unsubscriber", () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const on = vi.fn((channel: string, h: (...args: unknown[]) => void) => {
      handlers[channel] = h;
    });
    const removeListener = vi.fn();
    const api = buildTallymcpApi({ invoke: vi.fn(), on, removeListener });

    const cb = vi.fn();
    const unsubscribe = api.subscribeTallyStatus(cb);
    expect(on).toHaveBeenCalledWith(TALLY_STATUS_EVENT, expect.any(Function));

    handlers[TALLY_STATUS_EVENT]?.(undefined, { reachable: true, probedAt: 1 });
    expect(cb).toHaveBeenCalledWith({ reachable: true, probedAt: 1 });

    unsubscribe();
    expect(removeListener).toHaveBeenCalled();
  });

  it("invokes the correct channel for checkForUpdates", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "up-to-date", currentVersion: "1.0.0" });
    const api = buildTallymcpApi({ invoke, on: vi.fn() });

    const result = await api.checkForUpdates();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CHECK_FOR_UPDATES);
    expect(result.status).toBe("up-to-date");
  });

  it("invokes the correct channel for downloadUpdate", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = buildTallymcpApi({ invoke, on: vi.fn() });

    await api.downloadUpdate();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.DOWNLOAD_UPDATE);
  });

  it("invokes the correct channel for quitAndInstall", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = buildTallymcpApi({ invoke, on: vi.fn() });

    await api.quitAndInstall();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.QUIT_AND_INSTALL);
  });

  it("subscribes to update-status events and returns an unsubscriber", () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const on = vi.fn((channel: string, h: (...args: unknown[]) => void) => {
      handlers[channel] = h;
    });
    const removeListener = vi.fn();
    const api = buildTallymcpApi({ invoke: vi.fn(), on, removeListener });

    const cb = vi.fn();
    const unsubscribe = api.subscribeUpdateStatus(cb);
    expect(on).toHaveBeenCalledWith(UPDATE_STATUS_EVENT, expect.any(Function));

    handlers[UPDATE_STATUS_EVENT]?.(undefined, { status: "up-to-date", currentVersion: "1.0.0" });
    expect(cb).toHaveBeenCalledWith({ status: "up-to-date", currentVersion: "1.0.0" });

    unsubscribe();
    expect(removeListener).toHaveBeenCalled();
  });
});
