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
});
