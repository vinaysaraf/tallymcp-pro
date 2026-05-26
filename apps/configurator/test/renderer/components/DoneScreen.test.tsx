// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DoneScreen } from "../../../src/renderer/components/DoneScreen.js";

describe("DoneScreen", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the success message + sample question for the wired client", () => {
    render(
      <DoneScreen
        clientId="claude-desktop"
        clientDisplayName="Claude Desktop"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/TallyMCP is wired into Claude Desktop/i)).toBeDefined();
    expect(screen.getByText(/Restart Claude Desktop/i)).toBeDefined();
    expect(screen.getByText(/What's my sales for FY 22-23\?/)).toBeDefined();
  });

  it("calls onClose when 'Close' clicked", () => {
    const onClose = vi.fn();
    render(<DoneScreen clientId="cursor" clientDisplayName="Cursor" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
