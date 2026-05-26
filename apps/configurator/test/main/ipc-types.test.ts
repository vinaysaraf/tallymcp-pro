import { describe, it, expect } from "vitest";
import {
  IPC_CHANNELS,
  TALLY_STATUS_EVENT,
  UPDATE_STATUS_EVENT,
  type ClientId,
  type WireRequest,
  type WireResponse,
  type TallyStatus,
  type UpdateStatus,
} from "../../src/shared/ipc-types.js";

describe("IPC types", () => {
  it("exports the 9 required channel names", () => {
    expect(IPC_CHANNELS.WIRE_MCP).toBe("wire-mcp");
    expect(IPC_CHANNELS.UNWIRE_MCP).toBe("unwire-mcp");
    expect(IPC_CHANNELS.HEALTH_CHECK).toBe("health-check");
    expect(IPC_CHANNELS.TALLY_FIX).toBe("tally-fix");
    expect(IPC_CHANNELS.TALLY_RESTORE).toBe("tally-restore");
    expect(IPC_CHANNELS.GET_CONFIG).toBe("get-config");
    expect(IPC_CHANNELS.CHECK_FOR_UPDATES).toBe("check-for-updates");
    expect(IPC_CHANNELS.DOWNLOAD_UPDATE).toBe("download-update");
    expect(IPC_CHANNELS.QUIT_AND_INSTALL).toBe("quit-and-install");
  });

  it("exports the tally-status event name", () => {
    expect(TALLY_STATUS_EVENT).toBe("tally-status");
  });

  it("compiles the request/response/status type imports", () => {
    const id: ClientId = "claude-desktop";
    const req: WireRequest = { clientId: id };
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

  it("exports the update-status event name", () => {
    expect(UPDATE_STATUS_EVENT).toBe("update-status");
  });

  it("compiles the UpdateStatus type with all required fields", () => {
    const s: UpdateStatus = {
      status: "up-to-date",
      currentVersion: "1.0.0",
    };
    const s2: UpdateStatus = {
      status: "update-available",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseNotesUrl: "https://example.com/notes",
    };
    const s3: UpdateStatus = {
      status: "downloading",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      downloadProgress: 0.42,
    };
    const s4: UpdateStatus = {
      status: "ready-to-install",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
    };
    const s5: UpdateStatus = {
      status: "error",
      currentVersion: "1.0.0",
      error: "network unreachable",
    };
    expect(s && s2 && s3 && s4 && s5).toBeTruthy();
  });
});
