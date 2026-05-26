import type { UpdateStatus } from "../../shared/ipc-types.js";

export interface UpdateBannerProps {
  status: UpdateStatus;
  /** User clicked "Update now" — begin download. */
  onUpdateClick: () => void;
  /** User clicked "What's new" — open release notes in external browser. */
  onWhatsNewClick: () => void;
  /** User clicked "Later" — hide for this session. */
  onDismiss: () => void;
  /** User clicked "Restart now" — invoke quitAndInstall. */
  onRestartClick: () => void;
}

/**
 * Calm blue banner that surfaces the update-flow state machine (spec §10).
 * Rendered above StatusBanner + ErrorBanner in App.tsx. Returns null when
 * there's nothing to show (up-to-date OR error — errors are surfaced via
 * the existing ErrorBanner path, not this component).
 */
export function UpdateBanner({
  status,
  onUpdateClick,
  onWhatsNewClick,
  onDismiss,
  onRestartClick,
}: UpdateBannerProps): JSX.Element | null {
  if (status.status === "up-to-date" || status.status === "error") {
    return null;
  }

  if (status.status === "update-available") {
    return (
      <div
        role="status"
        className="bg-tm-blue-soft border border-tm-blue rounded-lg px-4 py-2 mb-4 text-sm text-tm-text flex items-center gap-3"
      >
        <span aria-hidden>↑</span>
        <span className="flex-1">
          TallyMCP v{status.latestVersion} is available
          {status.currentVersion ? ` (you're on v${status.currentVersion})` : ""}.
        </span>
        <button
          type="button"
          onClick={onUpdateClick}
          className="bg-tm-blue text-white px-3 py-1 rounded text-sm font-medium hover:opacity-90"
        >
          Update now
        </button>
        <button
          type="button"
          onClick={onWhatsNewClick}
          className="text-tm-blue underline text-sm"
        >
          What's new
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-tm-text-muted hover:text-tm-text text-sm"
        >
          Later
        </button>
      </div>
    );
  }

  if (status.status === "downloading") {
    const pct = Math.round((status.downloadProgress ?? 0) * 100);
    return (
      <div
        role="status"
        className="bg-tm-blue-soft border border-tm-blue rounded-lg px-4 py-2 mb-4 text-sm text-tm-text"
      >
        <div className="flex items-center gap-3 mb-1">
          <span aria-hidden>↓</span>
          <span className="flex-1">
            Downloading TallyMCP v{status.latestVersion}…
          </span>
          <span className="text-tm-text-muted text-xs">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 bg-tm-card border border-tm-border rounded overflow-hidden"
        >
          <div
            className="h-full bg-tm-blue transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // ready-to-install
  return (
    <div
      role="status"
      className="bg-tm-green-soft border border-tm-green-deep rounded-lg px-4 py-2 mb-4 text-sm text-tm-text flex items-center gap-3"
    >
      <span aria-hidden>✓</span>
      <span className="flex-1">
        Restart to apply TallyMCP v{status.latestVersion}.
      </span>
      <button
        type="button"
        onClick={onRestartClick}
        className="bg-tm-green-deep text-white px-3 py-1 rounded text-sm font-medium hover:opacity-90"
      >
        Restart now
      </button>
    </div>
  );
}
