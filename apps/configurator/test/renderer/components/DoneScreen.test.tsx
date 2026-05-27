// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DoneScreen } from "../../../src/renderer/components/DoneScreen.js";

// Global cleanup after each test so DOM is fresh for every describe block
afterEach(() => {
  cleanup();
});

describe("DoneScreen", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the success message + sample question for the wired client", () => {
    render(
      <DoneScreen
        clientId="claude-desktop"
        clientDisplayName="Claude Desktop"
        variants={["standard"]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/TallyMCP is wired into Claude Desktop/i)).toBeDefined();
    // Claude Desktop now shows tray-quit instructions, not generic restart copy
    expect(screen.getByTestId("tray-quit-instructions")).toBeDefined();
  });

  it("calls onClose when 'Close' clicked", () => {
    const onClose = vi.fn();
    render(
      <DoneScreen
        clientId="cursor"
        clientDisplayName="Cursor"
        variants={["standard"]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("DoneScreen — restart instructions (#139, #140)", () => {
  it("renders quit-from-tray instructions block when claude-desktop with variants=['standard']", () => {
    render(
      <DoneScreen
        clientId="claude-desktop"
        clientDisplayName="Claude Desktop"
        variants={["standard"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("tray-quit-instructions")).toBeInTheDocument();
    expect(screen.queryByTestId("msix-caveat-card")).not.toBeInTheDocument();
  });

  it("shows MSIX caveat card when variants includes 'msix'", () => {
    render(
      <DoneScreen
        clientId="claude-desktop"
        clientDisplayName="Claude Desktop"
        variants={["msix"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("msix-caveat-card")).toBeInTheDocument();
    expect(screen.getByText(/claude\.ai\/download/i)).toBeInTheDocument();
  });

  it("shows BOTH tray instructions + MSIX caveat when both variants present", () => {
    render(
      <DoneScreen
        clientId="claude-desktop"
        clientDisplayName="Claude Desktop"
        variants={["standard", "msix"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("tray-quit-instructions")).toBeInTheDocument();
    expect(screen.getByTestId("msix-caveat-card")).toBeInTheDocument();
  });

  it("does NOT render tray-quit instructions for non-Claude-Desktop clients (e.g. cursor)", () => {
    render(
      <DoneScreen
        clientId="cursor"
        clientDisplayName="Cursor"
        variants={["standard"]}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("tray-quit-instructions")).not.toBeInTheDocument();
    expect(screen.getByText(/restart cursor/i)).toBeInTheDocument();
  });
});
