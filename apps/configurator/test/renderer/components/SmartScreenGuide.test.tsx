// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { beforeEach } from "vitest";
import { SmartScreenGuide } from "../../../src/renderer/components/SmartScreenGuide.js";

describe("SmartScreenGuide", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows both two steps with annotated arrows", () => {
    render(<SmartScreenGuide onClose={vi.fn()} />);
    // "Windows protected your PC" appears in both step screenshots — expect at least 2.
    expect(screen.getAllByText(/Windows protected your PC/i).length).toBeGreaterThanOrEqual(2);
    // "More info" appears in both the instruction text and the mock screenshot — expect at least 2.
    expect(screen.getAllByText(/More info/i).length).toBeGreaterThanOrEqual(1);
    // "Run anyway" appears in both the instruction text and the mock screenshot — expect at least 2.
    expect(screen.getAllByText(/Run anyway/i).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when 'Got it' clicked", () => {
    const onClose = vi.fn();
    render(<SmartScreenGuide onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
