// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AddMcpModal } from "../../../src/renderer/components/AddMcpModal.js";

describe("AddMcpModal", () => {
  beforeEach(cleanup);

  const baseProps = {
    clientId: "claude-desktop" as const,
    displayName: "Claude Desktop",
    msixDetected: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onShowSmartScreenGuide: vi.fn(),
  };

  it("shows the 3-step plain-English info box", () => {
    render(<AddMcpModal {...baseProps} />);
    expect(screen.getByText(/I will do exactly 3 things/i)).toBeDefined();
    expect(screen.getByText(/Add one new entry/i)).toBeDefined();
    expect(screen.getByText(/Save a backup/i)).toBeDefined();
    expect(screen.getByText(/Tell you to restart Claude Desktop/i)).toBeDefined();
  });

  it("shows the green trust block", () => {
    render(<AddMcpModal {...baseProps} />);
    expect(screen.getByText(/What WILL NOT happen/i)).toBeDefined();
    expect(screen.getByText(/Your other AI servers will not be removed/i)).toBeDefined();
    expect(screen.getByText(/No data leaves your computer/i)).toBeDefined();
  });

  it("calls onConfirm when Add MCP clicked", () => {
    const onConfirm = vi.fn();
    render(<AddMcpModal {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /^Add MCP$/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel clicked", () => {
    const onCancel = vi.fn();
    render(<AddMcpModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onShowSmartScreenGuide when AV link clicked", () => {
    const onShowSmartScreenGuide = vi.fn();
    render(<AddMcpModal {...baseProps} onShowSmartScreenGuide={onShowSmartScreenGuide} />);
    fireEvent.click(screen.getByText(/Show me what to click/i));
    expect(onShowSmartScreenGuide).toHaveBeenCalled();
  });
});

describe("AddMcpModal — wire-time MSIX warning (#140 Cursor rec #2)", () => {
  afterEach(cleanup);

  it("renders MSIX wire-time warning card when claude-desktop AND msixDetected=true", () => {
    render(
      <AddMcpModal
        clientId="claude-desktop"
        displayName="Claude Desktop"
        msixDetected={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        onShowSmartScreenGuide={() => {}}
      />,
    );
    expect(screen.getByTestId("msix-wire-warning")).toBeInTheDocument();
    expect(screen.getByText(/claude\.ai\/download/i)).toBeInTheDocument();
  });

  it("does NOT render MSIX warning when msixDetected=false", () => {
    render(
      <AddMcpModal
        clientId="claude-desktop"
        displayName="Claude Desktop"
        msixDetected={false}
        onConfirm={() => {}}
        onCancel={() => {}}
        onShowSmartScreenGuide={() => {}}
      />,
    );
    expect(screen.queryByTestId("msix-wire-warning")).not.toBeInTheDocument();
  });

  it("does NOT render MSIX warning for non-Claude-Desktop clients even if msixDetected=true", () => {
    render(
      <AddMcpModal
        clientId="cursor"
        displayName="Cursor"
        msixDetected={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        onShowSmartScreenGuide={() => {}}
      />,
    );
    expect(screen.queryByTestId("msix-wire-warning")).not.toBeInTheDocument();
  });
});
