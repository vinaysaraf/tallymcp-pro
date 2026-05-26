// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ITPolicyHelpModal } from "../../../src/renderer/components/ITPolicyHelpModal.js";

describe("ITPolicyHelpModal", () => {
  // Use a non-default tally path so the test would catch a regression to
  // a hardcoded "C:\\Program Files\\TallyPrime\\tally.exe" (Cursor M2).
  const tallyExePath = "D:\\Tally Solutions\\TallyPrime\\tally.exe";

  beforeEach(() => {
    cleanup();
  });

  it("renders the exact netsh command IT can run, using the provided tally path", () => {
    render(<ITPolicyHelpModal tallyExePath={tallyExePath} onClose={vi.fn()} />);
    expect(screen.getAllByText(/netsh advfirewall firewall add rule/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/name="TallyMCP/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/localport=9000/i).length).toBeGreaterThanOrEqual(1);
    // Cursor M2: the netsh block must reflect the detected install path,
    // not a hardcoded default — otherwise IT runs a rule for the wrong exe.
    expect(screen.getAllByText(/D:\\Tally Solutions\\TallyPrime\\tally\.exe/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the equivalent PowerShell New-NetFirewallRule command with the same tally path", () => {
    render(<ITPolicyHelpModal tallyExePath={tallyExePath} onClose={vi.fn()} />);
    expect(screen.getAllByText(/New-NetFirewallRule/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/LocalPort 9000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/D:\\Tally Solutions\\TallyPrime\\tally\.exe/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the loopback-only reassurance + closes on the dismiss button", () => {
    const onClose = vi.fn();
    render(<ITPolicyHelpModal tallyExePath={tallyExePath} onClose={onClose} />);
    expect(screen.getByText(/skip this rule if you only use AI tools on this same PC/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
