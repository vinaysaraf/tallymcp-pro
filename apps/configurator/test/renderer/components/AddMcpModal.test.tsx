// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AddMcpModal } from "../../../src/renderer/components/AddMcpModal.js";

describe("AddMcpModal", () => {
  beforeEach(cleanup);

  const baseProps = {
    clientId: "claude-desktop" as const,
    displayName: "Claude Desktop",
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
