// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Settings } from "../../../src/renderer/components/Settings.js";

describe("Settings", () => {
  beforeEach(() => {
    cleanup();
  });

  const config = {
    installDir: "C:\\Users\\me\\AppData\\Local\\TallyMCP",
    tallyInstallDir: "C:\\Program Files\\TallyPrime (1)",
    version: "v1.0.0",
  };

  it("shows the install dir, Tally folder, and version", () => {
    render(
      <Settings
        config={config}
        onRestoreTallySettings={vi.fn()}
        onReCheck={vi.fn()}
      />,
    );
    expect(screen.getByText(config.installDir)).toBeDefined();
    expect(screen.getByText(config.tallyInstallDir!)).toBeDefined();
    expect(screen.getByText("v1.0.0")).toBeDefined();
  });

  it("calls onRestoreTallySettings with confirmation when clicked", () => {
    const onRestore = vi.fn();
    render(
      <Settings
        config={config}
        onRestoreTallySettings={onRestore}
        onReCheck={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore Tally settings/i }));
    expect(onRestore).toHaveBeenCalled();
  });

  it("calls onReCheck when 'Run health check' clicked", () => {
    const onReCheck = vi.fn();
    render(
      <Settings
        config={config}
        onRestoreTallySettings={vi.fn()}
        onReCheck={onReCheck}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Run health check/i }));
    expect(onReCheck).toHaveBeenCalled();
  });
});
