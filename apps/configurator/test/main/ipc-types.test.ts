import { describe, it, expect } from "vitest";
import {
  IPC_CHANNELS,
  TALLY_STATUS_EVENT,
  type ClientId,
  type WireRequest,
  type WireResponse,
  type TallyStatus,
} from "../../src/shared/ipc-types.js";

describe("IPC types", () => {
  it("exports the 6 required channel names", () => {
    expect(IPC_CHANNELS.WIRE_MCP).toBe("wire-mcp");
    expect(IPC_CHANNELS.UNWIRE_MCP).toBe("unwire-mcp");
    expect(IPC_CHANNELS.HEALTH_CHECK).toBe("health-check");
    expect(IPC_CHANNELS.TALLY_FIX).toBe("tally-fix");
    expect(IPC_CHANNELS.TALLY_RESTORE).toBe("tally-restore");
    expect(IPC_CHANNELS.GET_CONFIG).toBe("get-config");
  });

  it("exports the tally-status event name", () => {
    expect(TALLY_STATUS_EVENT).toBe("tally-status");
  });

  it("compiles the request/response/status type imports", () => {
    const id: ClientId = "claude-desktop";
    const req: WireRequest = { clientId: id, installDir: "C:\\TallyMCP" };
    const res: WireResponse = {
      clientId: id,
      configPath: "C:\\…\\config.json",
      backupCreated: true,
      action: "added",
    };
    const status: TallyStatus = {
      reachable: true,
      companyName: "OM JAI JAGDISH",
      probedAt: Date.now(),
    };
    expect(id && req && res && status).toBeTruthy();
  });
});
