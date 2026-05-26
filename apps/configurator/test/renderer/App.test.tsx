// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../../src/renderer/App.js";
import { useAppStore } from "../../src/renderer/store.js";
import type { TallymcpApi } from "../../src/preload/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var window: any;
}

// NOTE: The mock returns "C:\\TallyMCP" for installDir to keep the test
// readable. Production resolves to %LOCALAPPDATA%\TallyMCP via the
// LOCALAPPDATA env var in src/main/index.ts (see Task 9 fix).
function buildFakeApi(overrides: Partial<TallymcpApi> = {}): TallymcpApi {
  return {
    wireMcp: vi.fn().mockResolvedValue({
      clientId: "claude-desktop",
      configPath: "X",
      backupCreated: true,
      action: "added",
    }),
    unwireMcp: vi.fn().mockResolvedValue({
      clientId: "claude-desktop",
      configPath: "X",
      action: "removed",
    }),
    healthCheck: vi.fn().mockResolvedValue({
      tallyInstalled: true,
      tallyInstallDir: "C:\\Tally",
      tallyRunning: true,
      xmlInterfaceEnabled: true,
      firewallRulePresent: true,
      configuredClients: [],
    }),
    tallyFix: vi.fn().mockResolvedValue({
      xmlInterface: "applied",
      iniBackupCreated: true,
      firewallRule: "added",
    }),
    tallyRestore: vi.fn().mockResolvedValue({
      iniRestored: true,
      firewallRule: "removed",
    }),
    getConfig: vi.fn().mockResolvedValue({
      installDir: "C:\\TallyMCP",
      tallyInstallDir: "C:\\Tally",
      version: "v0.0.1",
    }),
    subscribeTallyStatus: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      currentScreen: "home",
      tallyStatus: { reachable: false, probedAt: 0 },
      configuredClients: new Set(),
      lastError: undefined,
    });
    globalThis.window.tallymcp = buildFakeApi();
  });

  it("renders the home screen (status banner + tile grid) by default", async () => {
    render(<App />);
    expect(await screen.findByText(/MCP server/i)).toBeDefined();
    expect(screen.getByText("Claude Desktop")).toBeDefined();
  });

  it("opens AddMcpModal when a tile's Add MCP is clicked", () => {
    render(<App />);
    const buttons = screen.getAllByRole("button", { name: /Add MCP/i });
    fireEvent.click(buttons[0]!); // Claude Desktop
    expect(screen.getByRole("dialog", { name: /Add TallyMCP to Claude Desktop/i })).toBeDefined();
  });

  it("calls wireMcp on the API when modal Add MCP confirmed", async () => {
    const api = buildFakeApi();
    globalThis.window.tallymcp = api;
    render(<App />);
    const tileButtons = screen.getAllByRole("button", { name: /Add MCP/i });
    fireEvent.click(tileButtons[0]!);
    const modalAdd = screen.getByRole("button", { name: /^Add MCP$/i });
    fireEvent.click(modalAdd);
    // wait for promise
    await new Promise((r) => setTimeout(r, 0));
    expect(api.wireMcp).toHaveBeenCalledWith({
      clientId: "claude-desktop",
      installDir: "C:\\TallyMCP",
    });
  });

  it("opens DoneScreen after wireMcp succeeds", async () => {
    const api = buildFakeApi();
    globalThis.window.tallymcp = api;
    render(<App />);
    const tileButtons = screen.getAllByRole("button", { name: /Add MCP/i });
    fireEvent.click(tileButtons[0]!);
    const modalAdd = screen.getByRole("button", { name: /^Add MCP$/i });
    fireEvent.click(modalAdd);
    // Wait for promise + state update
    await new Promise((r) => setTimeout(r, 10));
    expect(await screen.findByText(/TallyMCP is wired into Claude Desktop/i)).toBeDefined();
  });
});
