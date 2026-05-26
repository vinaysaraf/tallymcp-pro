// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TileGrid } from "../../../src/renderer/components/TileGrid.js";

describe("TileGrid", () => {
  beforeEach(() => {
    cleanup();
  });
  it("renders all 5 client tiles", () => {
    render(
      <TileGrid
        configuredClients={new Set()}
        onAdd={vi.fn()}
        onReconfigure={vi.fn()}
      />,
    );
    expect(screen.getByText("Claude Desktop")).toBeDefined();
    expect(screen.getByText("Cursor")).toBeDefined();
    expect(screen.getByText("Claude Code")).toBeDefined();
    expect(screen.getByText("LM Studio")).toBeDefined();
    expect(screen.getByText("Ollama")).toBeDefined();
  });

  it("propagates onAdd with the correct clientId", () => {
    const onAdd = vi.fn();
    render(
      <TileGrid
        configuredClients={new Set()}
        onAdd={onAdd}
        onReconfigure={vi.fn()}
      />,
    );
    // Click Cursor's Add MCP button (second tile)
    const buttons = screen.getAllByRole("button", { name: /Add MCP/i });
    // Cursor is in the registry order; click the 2nd one
    fireEvent.click(buttons[1]!);
    expect(onAdd).toHaveBeenCalledWith("cursor");
  });
});
