import { describe, it, expect, vi } from "vitest";
import { buildTallymcpApi } from "../../src/preload/index.js";
import { IPC_CHANNELS, TALLY_STATUS_EVENT } from "../../src/shared/ipc-types.js";

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
});
