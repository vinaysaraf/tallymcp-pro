// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../../src/renderer/App.js";
import { useAppStore } from "../../src/renderer/store.js";
import type { TallymcpApi } from "../../src/shared/ipc-types.js";

declare global {
  interface Window {
    tallymcp?: TallymcpApi;
  }
}

// NOTE: getConfig.installDir is "C:\\TallyMCP" for readability — but
// installDir is no longer relayed back via WireRequest (Cursor H1).
// It's used only for the Settings display.
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
    });
  });

  it("hydrates configuredClients from healthCheck (H10): Claude Desktop tile shows Connected + Reconfigure", async () => {
    const api = buildFakeApi({
      healthCheck: vi.fn().mockResolvedValue({
        tallyInstalled: true,
        tallyInstallDir: "C:\\Tally",
        tallyRunning: true,
        xmlInterfaceEnabled: true,
        firewallRulePresent: true,
        configuredClients: ["claude-desktop"],
      }),
    });
    globalThis.window.tallymcp = api;
    render(<App />);
    // findByRole waits for the post-healthCheck re-render to apply the hydrate.
    expect(
      await screen.findByRole("button", { name: /Reconfigure/i }),
    ).toBeDefined();
    // "Not added" should NOT appear for Claude Desktop since it's configured.
    // (Other 4 tiles are still "Not added" — so this assertion is per-tile via the connected text.)
    expect(screen.getAllByText(/Connected/i).length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces wireMcp failures via ErrorBanner (Cursor M1)", async () => {
    const api = buildFakeApi({
      wireMcp: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    globalThis.window.tallymcp = api;
    render(<App />);
    const tileButtons = screen.getAllByRole("button", { name: /Add MCP/i });
    fireEvent.click(tileButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Add MCP$/i }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("disk full");
    // Dismiss clears the banner.
    fireEvent.click(screen.getByRole("button", { name: /Dismiss error/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces tallyFix failures via ErrorBanner (Cursor M3)", async () => {
    const api = buildFakeApi({
      // needsFix === true requires xml OR firewall to be false so the
      // "Fix both, continue" button actually renders.
      healthCheck: vi.fn().mockResolvedValue({
        tallyInstalled: true,
        tallyInstallDir: "C:\\Tally",
        tallyRunning: true,
        xmlInterfaceEnabled: false,
        firewallRulePresent: false,
        configuredClients: [],
      }),
      tallyFix: vi.fn().mockRejectedValue(new Error("Multiple TallyPrime installs found")),
    });
    globalThis.window.tallymcp = api;
    render(<App />);
    // Wait for the initial healthCheck() in useEffect so HealthCheck screen
    // has data when we navigate there.
    await screen.findByText("Claude Desktop");
    fireEvent.click(screen.getByRole("button", { name: /Health Check/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Fix both, continue/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Multiple TallyPrime installs found");
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

  it("opens ITPolicyHelpModal when tallyFix returns firewallRule='group-policy-blocked'", async () => {
    const api = buildFakeApi({
      // Navigate to Health Check screen so the Fix button is reachable.
      healthCheck: vi.fn().mockResolvedValue({
        tallyInstalled: true,
        tallyInstallDir: "C:\\Tally",
        tallyRunning: true,
        xmlInterfaceEnabled: false,
        firewallRulePresent: false,
        configuredClients: [],
        isElevated: true,
      }),
      tallyFix: vi.fn().mockResolvedValue({
        xmlInterface: "applied",
        iniBackupCreated: true,
        firewallRule: "group-policy-blocked",
      }),
    });
    globalThis.window.tallymcp = api;
    render(<App />);
    await screen.findByText("Claude Desktop"); // wait for the initial useEffect chain
    fireEvent.click(screen.getByRole("button", { name: /Health Check/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Fix both/i }));
    expect(await screen.findByRole("dialog", { name: /IT policy firewall guidance/i })).toBeDefined();
  });

  it("sets firewallSkipReason in the store when tallyFix returns firewallRule='skipped-non-admin'", async () => {
    const api = buildFakeApi({
      healthCheck: vi.fn().mockResolvedValue({
        tallyInstalled: true,
        tallyInstallDir: "C:\\Tally",
        tallyRunning: true,
        xmlInterfaceEnabled: false,
        firewallRulePresent: false,
        configuredClients: [],
        isElevated: false,
      }),
      tallyFix: vi.fn().mockResolvedValue({
        xmlInterface: "applied",
        iniBackupCreated: true,
        firewallRule: "skipped-non-admin",
      }),
    });
    globalThis.window.tallymcp = api;
    render(<App />);
    await screen.findByText("Claude Desktop");
    fireEvent.click(screen.getByRole("button", { name: /Health Check/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Fix both/i }));
    expect(await screen.findByText(/Couldn't add the firewall rule/i)).toBeDefined();
  });
});
