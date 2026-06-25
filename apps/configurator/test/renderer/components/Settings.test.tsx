// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { Settings } from "../../../src/renderer/components/Settings.js";
import type { ConfigSnapshot } from "../../../src/shared/ipc-types.js";

describe("Settings", () => {
  beforeEach(() => {
    cleanup();
  });

  const config: ConfigSnapshot = {
    installDir: "C:\\Users\\me\\AppData\\Local\\TallyMCP",
    tallyInstallDir: "C:\\Program Files\\TallyPrime (1)",
    version: "v1.0.0",
    tallyHost: "127.0.0.1",
    tallyPort: 9000,
    tallyConnectionType: "local",
  };

  const renderSettings = (overrides: Partial<ComponentProps<typeof Settings>> = {}) =>
    render(
      <Settings
        config={config}
        onRestoreTallySettings={vi.fn()}
        onReCheck={vi.fn()}
        onSaveTallyConnection={vi.fn().mockResolvedValue(undefined)}
        {...overrides}
      />,
    );

  it("shows the install dir, Tally folder, and version", () => {
    renderSettings();
    expect(screen.getByText(config.installDir)).toBeDefined();
    expect(screen.getByText(config.tallyInstallDir!)).toBeDefined();
    expect(screen.getByText("v1.0.0")).toBeDefined();
  });

  it("calls onRestoreTallySettings with confirmation when clicked", () => {
    const onRestore = vi.fn();
    renderSettings({ onRestoreTallySettings: onRestore });
    fireEvent.click(screen.getByRole("button", { name: /Restore Tally settings/i }));
    expect(onRestore).toHaveBeenCalled();
  });

  it("calls onReCheck when 'Run health check' clicked", () => {
    const onReCheck = vi.fn();
    renderSettings({ onReCheck });
    fireEvent.click(screen.getByRole("button", { name: /Run health check/i }));
    expect(onReCheck).toHaveBeenCalled();
  });

  it("saves a Server Tally location with the entered host + port", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSettings({ onSaveTallyConnection: onSave });
    fireEvent.click(screen.getByLabelText(/Server \/ another PC/i));
    fireEvent.change(screen.getByLabelText(/Host \/ IP/i), { target: { value: "192.168.1.50" } });
    fireEvent.change(screen.getByLabelText(/^Port$/i), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Tally location/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("192.168.1.50", 9000));
  });

  it("defaults host to 127.0.0.1 when 'This PC' is selected", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSettings({ onSaveTallyConnection: onSave });
    fireEvent.click(screen.getByRole("button", { name: /Save Tally location/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("127.0.0.1", 9000));
  });

  it("rejects an empty server host without calling onSave", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSettings({ onSaveTallyConnection: onSave });
    fireEvent.click(screen.getByLabelText(/Server \/ another PC/i));
    fireEvent.change(screen.getByLabelText(/Host \/ IP/i), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save Tally location/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/server's IP/i);
  });
});
