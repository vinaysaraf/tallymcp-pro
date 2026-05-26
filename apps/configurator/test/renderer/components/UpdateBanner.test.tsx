// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { UpdateBanner } from "../../../src/renderer/components/UpdateBanner.js";
import type { UpdateStatus } from "../../../src/shared/ipc-types.js";

describe("UpdateBanner", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the available-update message with version + Update/What's new/Later buttons", () => {
    const status: UpdateStatus = {
      status: "update-available",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseNotesUrl: "https://example.com/notes",
    };
    render(
      <UpdateBanner
        status={status}
        onUpdateClick={vi.fn()}
        onWhatsNewClick={vi.fn()}
        onDismiss={vi.fn()}
        onRestartClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/TallyMCP v1\.1\.0 is available/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Update now/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /What's new/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Later/i })).toBeDefined();
  });

  it("renders the downloading state with progress bar", () => {
    const status: UpdateStatus = {
      status: "downloading",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      downloadProgress: 0.42,
    };
    render(
      <UpdateBanner
        status={status}
        onUpdateClick={vi.fn()}
        onWhatsNewClick={vi.fn()}
        onDismiss={vi.fn()}
        onRestartClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/Downloading TallyMCP v1\.1\.0/i)).toBeDefined();
    expect(screen.getByRole("progressbar")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  });

  it("renders ready-to-install state with Restart CTA", () => {
    const status: UpdateStatus = {
      status: "ready-to-install",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
    };
    const onRestartClick = vi.fn();
    render(
      <UpdateBanner
        status={status}
        onUpdateClick={vi.fn()}
        onWhatsNewClick={vi.fn()}
        onDismiss={vi.fn()}
        onRestartClick={onRestartClick}
      />,
    );
    expect(screen.getByText(/Restart to apply/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Restart now/i }));
    expect(onRestartClick).toHaveBeenCalled();
  });

  it("renders nothing when status is up-to-date", () => {
    const status: UpdateStatus = {
      status: "up-to-date",
      currentVersion: "1.0.0",
    };
    const { container } = render(
      <UpdateBanner
        status={status}
        onUpdateClick={vi.fn()}
        onWhatsNewClick={vi.fn()}
        onDismiss={vi.fn()}
        onRestartClick={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("calls onUpdateClick when Update now is clicked", () => {
    const status: UpdateStatus = {
      status: "update-available",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
    };
    const onUpdateClick = vi.fn();
    render(
      <UpdateBanner
        status={status}
        onUpdateClick={onUpdateClick}
        onWhatsNewClick={vi.fn()}
        onDismiss={vi.fn()}
        onRestartClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Update now/i }));
    expect(onUpdateClick).toHaveBeenCalled();
  });
});
