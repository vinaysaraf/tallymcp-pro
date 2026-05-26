// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ClientTile } from "../../../src/renderer/components/ClientTile.js";

describe("ClientTile", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows '✓ Connected' + Reconfigure button when configured=true", () => {
    render(
      <ClientTile
        clientId="claude-desktop"
        displayName="Claude Desktop"
        configured={true}
        onAdd={vi.fn()}
        onReconfigure={vi.fn()}
      />,
    );
    expect(screen.getByText(/Claude Desktop/)).toBeDefined();
    expect(screen.getByText(/Connected/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Reconfigure/i })).toBeDefined();
  });

  it("shows 'Not added' + Add MCP button when configured=false", () => {
    render(
      <ClientTile
        clientId="cursor"
        displayName="Cursor"
        configured={false}
        onAdd={vi.fn()}
        onReconfigure={vi.fn()}
      />,
    );
    expect(screen.getByText(/Not added/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Add MCP/i })).toBeDefined();
  });

  it("calls onAdd when Add MCP clicked", () => {
    const onAdd = vi.fn();
    render(
      <ClientTile
        clientId="cursor"
        displayName="Cursor"
        configured={false}
        onAdd={onAdd}
        onReconfigure={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add MCP/i }));
    expect(onAdd).toHaveBeenCalledWith("cursor");
  });

  it("calls onReconfigure when Reconfigure clicked", () => {
    const onReconfigure = vi.fn();
    render(
      <ClientTile
        clientId="claude-desktop"
        displayName="Claude Desktop"
        configured={true}
        onAdd={vi.fn()}
        onReconfigure={onReconfigure}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reconfigure/i }));
    expect(onReconfigure).toHaveBeenCalledWith("claude-desktop");
  });
});
