// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HealthCheck } from "../../../src/renderer/components/HealthCheck.js";

describe("HealthCheck", () => {
  beforeEach(cleanup);

  it("shows all checks passing when everything green", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: true,
          firewallRulePresent: true,
          configuredClients: [],
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByText(/TallyPrime found/i)).toBeDefined();
    expect(screen.getByText(/Tally is running/i)).toBeDefined();
    expect(screen.getByText(/XML interface.*on/i)).toBeDefined();
    expect(screen.getByText(/Firewall rule.*present/i)).toBeDefined();
  });

  it("shows yellow 1-click fix when XML interface is OFF", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: false,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByText(/Tally XML interface.*OFF/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Fix both, continue/i })).toBeDefined();
  });

  it("calls onFixAll when 'Fix both' clicked", () => {
    const onFixAll = vi.fn();
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: false,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        onFixAll={onFixAll}
        onReCheck={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix both, continue/i }));
    expect(onFixAll).toHaveBeenCalled();
  });

  it("shows red 'Install TallyPrime' when not installed", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: false,
          tallyRunning: false,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByText(/Install TallyPrime/i)).toBeDefined();
  });

  it("shows the firewall-skip-non-admin yellow card when firewallSkipReason is 'non-admin'", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: true,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        firewallSkipReason="non-admin"
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByText(/Couldn't add the firewall rule/i)).toBeDefined();
    expect(screen.getByText(/admin rights required/i)).toBeDefined();
    expect(screen.getByText(/loopback/i)).toBeDefined();
  });

  it("shows Re-check (not Fix loop) when XML is OK and firewall was skipped (Cursor H1)", () => {
    // Post-skip state: XML on, firewall missing but known-skipped.
    // The original `needsFix` gate would loop on "Fix both" → re-fail.
    // Patch A's split gate uses firewallSkipReason to switch to Re-check.
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: true,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        firewallSkipReason="non-admin"
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Re-check/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Fix both/i })).toBeNull();
  });

  it("does NOT show the firewall-skip explanation when firewallSkipReason is undefined", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Couldn't add the firewall rule/i)).toBeNull();
  });

  it("shows '(Admin needed)' on the Fix button when status.isElevated is false and a fix is needed", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
          isElevated: false,
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Fix both \(Admin needed\)/i })).toBeDefined();
    expect(screen.getByText(/Run as administrator/i)).toBeDefined();
  });

  it("shows the plain 'Fix both' button when status.isElevated is true", () => {
    render(
      <HealthCheck
        status={{
          tallyInstalled: true,
          tallyInstallDir: "C:\\Program Files\\TallyPrime",
          tallyRunning: true,
          xmlInterfaceEnabled: false,
          firewallRulePresent: false,
          configuredClients: [],
          isElevated: true,
        }}
        onFixAll={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Fix both, continue/i })).toBeDefined();
    expect(screen.queryByText(/Run as administrator/i)).toBeNull();
  });
});
