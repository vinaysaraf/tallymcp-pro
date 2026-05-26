// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBanner } from "../../../src/renderer/components/StatusBanner.js";

describe("StatusBanner", () => {
  it("shows 'Tally connected — <company>' when reachable + company loaded", () => {
    render(
      <StatusBanner
        tallyStatus={{ reachable: true, companyName: "OM JAI JAGDISH", probedAt: 1 }}
        serverHealthy={true}
        version="v1.0.0"
      />,
    );
    expect(screen.getByText(/Tally connected/i)).toBeDefined();
    expect(screen.getByText(/OM JAI JAGDISH/i)).toBeDefined();
    expect(screen.getByText(/MCP server running/i)).toBeDefined();
    expect(screen.getByText("v1.0.0")).toBeDefined();
  });

  it("shows 'Tally not reachable' when probe failed", () => {
    render(
      <StatusBanner
        tallyStatus={{ reachable: false, probedAt: 1 }}
        serverHealthy={false}
        version="v1.0.0"
      />,
    );
    expect(screen.getByText(/Tally not reachable/i)).toBeDefined();
  });
});
