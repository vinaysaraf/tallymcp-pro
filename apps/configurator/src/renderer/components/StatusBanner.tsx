import type { TallyStatus } from "../../shared/ipc-types.js";

export interface StatusBannerProps {
  tallyStatus: TallyStatus;
  serverHealthy: boolean;
  version: string;
}

export function StatusBanner({ tallyStatus, serverHealthy, version }: StatusBannerProps): JSX.Element {
  return (
    <div className="bg-tm-card border border-tm-border rounded-lg px-4 py-3 mb-4 text-sm text-tm-text">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className={tallyStatus.reachable ? "text-tm-green-deep" : "text-red-600"}
            aria-hidden
          >
            ●
          </span>
          {tallyStatus.reachable ? (
            <span>
              Tally connected
              {tallyStatus.companyName ? ` — ${tallyStatus.companyName}` : ""}
            </span>
          ) : (
            <span>Tally not reachable</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={serverHealthy ? "text-tm-green-deep" : "text-tm-text-muted"} aria-hidden>
            ●
          </span>
          <span>MCP server {serverHealthy ? "running" : "stopped"}</span>
        </div>
        <div className="ml-auto text-tm-text-muted text-xs">{version}</div>
      </div>
    </div>
  );
}
