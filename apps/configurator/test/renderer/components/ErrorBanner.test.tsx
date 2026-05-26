// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBanner } from "../../../src/renderer/components/ErrorBanner.js";

describe("ErrorBanner", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the message inside a role=alert", () => {
    render(<ErrorBanner message="Multiple TallyPrime installs found" onDismiss={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Multiple TallyPrime installs found");
  });

  it("calls onDismiss when the × button is clicked", () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner message="boom" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
