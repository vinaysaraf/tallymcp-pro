// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ResetConfigModal } from "../../../src/renderer/components/ResetConfigModal.js";

afterEach(cleanup);

describe("ResetConfigModal", () => {
  it("shows the client name and explains it restores the most recent backup", () => {
    render(
      <ResetConfigModal clientDisplayName="Claude Desktop" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/Reset Claude Desktop configuration\?/i)).toBeInTheDocument();
    expect(screen.getByText(/most recent backup/i)).toBeInTheDocument();
    expect(screen.getByText(/reversible/i)).toBeInTheDocument();
  });

  it("fires onConfirm when Reset config is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ResetConfigModal clientDisplayName="Cursor" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("reset-config-confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ResetConfigModal clientDisplayName="Cursor" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
