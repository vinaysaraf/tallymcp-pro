// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RestoreConfirmModal } from "../../../src/renderer/components/RestoreConfirmModal.js";

describe("RestoreConfirmModal", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the 2-step plan + warning that this is destructive", () => {
    render(<RestoreConfirmModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Restore Tally settings/i)).toBeDefined();
    expect(screen.getByText(/I will undo 2 changes/i)).toBeDefined();
    expect(screen.getByText(/restored from backup/i)).toBeDefined();
    expect(screen.getByText(/Firewall rule/i)).toBeDefined();
  });

  it("calls onConfirm when Restore clicked", () => {
    const onConfirm = vi.fn();
    render(<RestoreConfirmModal onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel clicked", () => {
    const onCancel = vi.fn();
    render(<RestoreConfirmModal onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
