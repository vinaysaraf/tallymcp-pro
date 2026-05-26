// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../../src/renderer/store.js";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentScreen: "home",
      tallyStatus: { reachable: false, probedAt: 0 },
      configuredClients: new Set(),
      lastError: undefined,
      firewallSkipReason: undefined,
    });
  });

  it("initial state is home screen + Tally unreachable", () => {
    expect(useAppStore.getState().currentScreen).toBe("home");
    expect(useAppStore.getState().tallyStatus.reachable).toBe(false);
  });

  it("navigateTo updates currentScreen", () => {
    useAppStore.getState().navigateTo("settings");
    expect(useAppStore.getState().currentScreen).toBe("settings");
  });

  it("setTallyStatus replaces the status object", () => {
    useAppStore.getState().setTallyStatus({
      reachable: true,
      companyName: "OM JAI JAGDISH",
      probedAt: 12345,
    });
    expect(useAppStore.getState().tallyStatus.companyName).toBe("OM JAI JAGDISH");
  });

  it("markClientConfigured + isClientConfigured track the set", () => {
    useAppStore.getState().markClientConfigured("claude-desktop");
    expect(useAppStore.getState().isClientConfigured("claude-desktop")).toBe(true);
    expect(useAppStore.getState().isClientConfigured("cursor")).toBe(false);
  });

  it("unmarkClientConfigured removes from the set", () => {
    useAppStore.getState().markClientConfigured("claude-desktop");
    useAppStore.getState().unmarkClientConfigured("claude-desktop");
    expect(useAppStore.getState().isClientConfigured("claude-desktop")).toBe(false);
  });

  it("setLastError + clearLastError manage the error string", () => {
    useAppStore.getState().setLastError("boom");
    expect(useAppStore.getState().lastError).toBe("boom");
    useAppStore.getState().clearLastError();
    expect(useAppStore.getState().lastError).toBeUndefined();
  });

  it("navigateTo clears lastError so stale errors don't follow the user (Cursor M1)", () => {
    useAppStore.getState().setLastError("Multiple TallyPrime installs found");
    useAppStore.getState().navigateTo("settings");
    expect(useAppStore.getState().currentScreen).toBe("settings");
    expect(useAppStore.getState().lastError).toBeUndefined();
  });

  it("setFirewallSkipReason + clearFirewallSkipReason manage the firewall skip state", () => {
    useAppStore.getState().setFirewallSkipReason("non-admin");
    expect(useAppStore.getState().firewallSkipReason).toBe("non-admin");

    useAppStore.getState().setFirewallSkipReason("group-policy");
    expect(useAppStore.getState().firewallSkipReason).toBe("group-policy");

    useAppStore.getState().clearFirewallSkipReason();
    expect(useAppStore.getState().firewallSkipReason).toBeUndefined();
  });

  it("navigateTo clears firewallSkipReason (along with lastError)", () => {
    useAppStore.getState().setFirewallSkipReason("non-admin");
    useAppStore.getState().setLastError("boom");
    useAppStore.getState().navigateTo("settings");
    expect(useAppStore.getState().firewallSkipReason).toBeUndefined();
    expect(useAppStore.getState().lastError).toBeUndefined();
  });
});
