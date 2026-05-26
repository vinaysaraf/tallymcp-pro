import type { HealthCheckResponse } from "../../shared/ipc-types.js";

export interface HealthCheckProps {
  status: HealthCheckResponse;
  onFixAll: () => void;
  onReCheck: () => void;
}

export function HealthCheck({ status, onFixAll, onReCheck }: HealthCheckProps): JSX.Element {
  const needsFix = status.tallyInstalled && (!status.xmlInterfaceEnabled || !status.firewallRulePresent);

  return (
    <div className="bg-tm-card border border-tm-border rounded-lg p-5 text-sm text-tm-text">
      <div className="font-bold text-tm-blue-deep mb-3">Let's check your PC is ready</div>

      {!status.tallyInstalled && (
        <div className="text-red-600 mb-2">
          ● Install TallyPrime first.{" "}
          <a
            href="https://tallysolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-tm-blue underline"
          >
            Download from tallysolutions.com →
          </a>
        </div>
      )}

      {status.tallyInstalled && (
        <>
          <div className="leading-relaxed">
            <div className="text-tm-green-deep">
              ● TallyPrime found at <code className="font-mono text-xs">{status.tallyInstallDir}</code>
            </div>
            <div className={status.tallyRunning ? "text-tm-green-deep" : "text-tm-amber-border"}>
              ● Tally is {status.tallyRunning ? "running" : "not running (open it and load a company)"}
            </div>
            <div
              className={
                status.xmlInterfaceEnabled ? "text-tm-green-deep" : "text-tm-amber-border"
              }
            >
              ● Tally XML interface is {status.xmlInterfaceEnabled ? "on" : "OFF"}
            </div>
            <div
              className={status.firewallRulePresent ? "text-tm-green-deep" : "text-tm-amber-border"}
            >
              ● Firewall rule {status.firewallRulePresent ? "present" : "missing"}
            </div>
          </div>
          {needsFix && (
            <div className="text-right mt-4">
              <button
                type="button"
                onClick={onFixAll}
                className="bg-tm-blue text-white py-1.5 px-4 rounded font-medium text-sm hover:opacity-90"
              >
                Fix both, continue →
              </button>
            </div>
          )}
          {!needsFix && (
            <div className="text-right mt-4">
              <button
                type="button"
                onClick={onReCheck}
                className="border border-tm-border bg-tm-card py-1.5 px-4 rounded text-sm hover:bg-tm-bg"
              >
                Re-check
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
