// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DisconnectConfirmModal } from "../../../src/renderer/components/DisconnectConfirmModal.js";

afterEach(cleanup);

describe("DisconnectConfirmModal (#141)", () => {
  it("renders the client display name in the title and confirm button", () => {
    render(
      <DisconnectConfirmModal
        clientDisplayName="Claude Desktop"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/disconnect tallymcp from claude desktop/i)).toBeInTheDocument();
    expect(screen.getByTestId("disconnect-confirm-button")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onConfirm when the destructive Disconnect button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <DisconnectConfirmModal
        clientDisplayName="Cursor"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("disconnect-confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <DisconnectConfirmModal
        clientDisplayName="LM Studio"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("reassures the user that other settings are unaffected", () => {
    render(
      <DisconnectConfirmModal
        clientDisplayName="Claude Desktop"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/won't affect|other mcp|other settings/i)).toBeInTheDocument();
  });
});
