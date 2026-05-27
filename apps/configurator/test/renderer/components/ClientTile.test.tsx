// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ClientTile } from "../../../src/renderer/components/ClientTile.js";

afterEach(cleanup);

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
        onDisconnect={vi.fn()}
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
        onDisconnect={vi.fn()}
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
        onDisconnect={vi.fn()}
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
        onDisconnect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reconfigure/i }));
    expect(onReconfigure).toHaveBeenCalledWith("claude-desktop");
  });
});

describe("ClientTile — Disconnect button (#141)", () => {
  it("renders Disconnect button next to Reconfigure when configured=true", () => {
    render(
      <ClientTile
        clientId="claude-desktop"
        displayName="Claude Desktop"
        configured={true}
        onAdd={() => {}}
        onReconfigure={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /reconfigure/i })).toBeInTheDocument();
    expect(screen.getByTestId("disconnect-claude-desktop")).toBeInTheDocument();
  });

  it("does NOT render Disconnect button when configured=false", () => {
    render(
      <ClientTile
        clientId="cursor"
        displayName="Cursor"
        configured={false}
        onAdd={() => {}}
        onReconfigure={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.queryByTestId("disconnect-cursor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add mcp/i })).toBeInTheDocument();
  });

  it("calls onDisconnect with clientId when Disconnect is clicked", () => {
    const onDisconnect = vi.fn();
    render(
      <ClientTile
        clientId="lm-studio"
        displayName="LM Studio"
        configured={true}
        onAdd={() => {}}
        onReconfigure={() => {}}
        onDisconnect={onDisconnect}
      />,
    );
    fireEvent.click(screen.getByTestId("disconnect-lm-studio"));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith("lm-studio");
  });
});
