import type { HealthCheckResponse } from "../../shared/ipc-types.js";
import type { FirewallSkipReason } from "../store.js";

export interface HealthCheckProps {
  status: HealthCheckResponse;
  /**
   * Phase 3.1 Patch A: when set, render an extra yellow card below the
   * status list explaining why the firewall rule wasn't added (and that
   * the XML interface change still applied, and that loopback-only setups
   * work without the rule).
   */
  firewallSkipReason?: FirewallSkipReason;
  onFixAll: () => void;
  onReCheck: () => void;
}

export function HealthCheck({ status, firewallSkipReason, onFixAll, onReCheck }: HealthCheckProps): JSX.Element {
  // Split the gate (Cursor H1): if the only thing missing is the firewall
  // rule AND we already know it was skipped (admin-needed or IT-policy),
  // clicking Fix again won't help — it'll re-fail the same way. Show
  // Re-check instead so the user can verify after they've taken manual
  // action (relaunched as admin, IT added the rule, etc.).
  const xmlNeedsFix = status.tallyInstalled && !status.xmlInterfaceEnabled;
  const firewallNeedsFix = status.tallyInstalled && !status.firewallRulePresent;
  const firewallIsKnownSkipped = firewallSkipReason !== undefined;
  const needsFix = xmlNeedsFix || (firewallNeedsFix && !firewallIsKnownSkipped);
  // #137: Fix button is disabled when >1 TallyPrime install exists — handleTallyFix
  // throws in that case, so preventing the click avoids a Fix that always fails.
  const hasMultipleInstalls = (status.multipleTallyInstalls?.length ?? 0) > 1;

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

          {/* #129 — Edition info row (only shown when explicitly configured) */}
          {status.tallyEdition && (
            <div className="mt-2 text-xs text-tm-text-muted">
              Edition:{" "}
              <strong>
                {status.tallyEdition === "gold"
                  ? "Gold — voucher queries enabled"
                  : status.tallyEdition === "silver"
                    ? "Silver — voucher tools disabled (use UI export, or override via config.tally.assumedEdition)"
                    : "Unknown"}
              </strong>
            </div>
          )}
          {/*
            Patch A yellow card is **deliberately scoped to "non-admin"** —
            the "group-policy" case is routed to ITPolicyHelpModal (Patch
            D) by App.tsx because IT-policy blocks need a different
            response (give exact netsh command to IT) than admin-needed
            blocks (re-launch as admin / loopback-only reassurance).
            Both states still trigger the post-skip Re-check gate above
            via `firewallIsKnownSkipped`. (Cursor M5, 2026-05-26.)

            Additionally guarded by `!status.firewallRulePresent` (Cursor
            M-R3-1, 2026-05-26): if IT/the user adds the rule externally
            then clicks Re-check, the status line flips to "✓ Firewall
            rule present" — without this guard the yellow card would
            remain and directly contradict the status. The guard IS the
            in-screen cleanup; `firewallSkipReason` stays set until
            screen change (`navigateTo` clears it via store.ts), but
            that's a separate concern — Re-check itself doesn't navigate.
            (Cursor N-R4-1 comment fix, 2026-05-26.)
          */}
          {firewallSkipReason === "non-admin" && !status.firewallRulePresent && (
            <div className="mt-4 p-3 bg-tm-amber-soft border border-tm-amber-border rounded-lg text-xs leading-relaxed">
              <div className="font-semibold mb-1">⚠ Couldn't add the firewall rule</div>
              <div className="mb-2">
                <strong>Admin rights required</strong>, or your IT policy may
                block it. The XML interface change DID apply — that part worked.
              </div>
              <div className="text-tm-text-muted">
                AI tools on this same PC still work over loopback (most CA
                setups). The firewall rule is only needed for multi-machine
                setups (Tally on PC-A, AI tool on PC-B).
              </div>
            </div>
          )}

          {/* #129 — Tally Gateway Server info card */}
          {status.tallyGatewayServer && (
            <div className="mt-4 p-3 bg-tm-amber-soft border border-tm-amber-border rounded-lg text-xs leading-relaxed">
              <div className="font-semibold mb-1">⚠ Tally Gateway Server: {status.tallyGatewayServer}</div>
              <div>
                Networked client mode — XML queries forward to{" "}
                <code className="font-mono text-xs">{status.tallyGatewayServer}</code>.
                If the gateway host is unreachable or slow, Tally may hang on heavy
                operations (audit-lite, large Day Book queries). For best reliability,
                use TallyMCP on the gateway host itself or ensure the host is on your
                local network.
              </div>
            </div>
          )}

          {/* #131 — Dual-client warning */}
          {status.configuredClients.length > 1 && (
            <div className="mt-4 p-3 bg-tm-amber-soft border border-tm-amber-border rounded-lg text-xs leading-relaxed">
              <div className="font-semibold mb-1">
                ⚠ {status.configuredClients.length} AI clients configured ({status.configuredClients.join(", ")})
              </div>
              <div>
                Each AI client spawns its own MCP server process. Tally's XML interface
                is single-threaded — running queries from multiple clients simultaneously
                can overload it and cause hangs. Use one client at a time during heavy
                operations (audit-lite, large date-range Day Book).
              </div>
            </div>
          )}

          {/* #137 — Multiple TallyPrime installs warning */}
          {status.multipleTallyInstalls && status.multipleTallyInstalls.length > 1 && (
            <div className="mt-4 p-3 bg-tm-amber-soft border border-tm-amber-border rounded-lg text-xs leading-relaxed">
              <div className="font-semibold mb-1">⚠ Multiple TallyPrime installs detected</div>
              <ul className="list-disc list-inside mb-2">
                {status.multipleTallyInstalls.map((p) => (
                  <li key={p}>
                    <code className="font-mono text-xs">{p}</code>
                  </li>
                ))}
              </ul>
              <div>
                Tally Fix can only target one install. Either uninstall the unused
                copy, or note which path Tally actually runs from. The Fix button is
                disabled while multiple installs exist.
              </div>
            </div>
          )}

          {needsFix && (
            <div className="mt-4">
              {status.isElevated === false && (
                <div className="mb-2 text-xs text-tm-text-muted leading-relaxed">
                  💡 <strong>Right-click TallyMCP → Run as administrator</strong>,
                  OR follow the manual steps after clicking Fix.
                </div>
              )}
              <div className="text-right">
                <button
                  type="button"
                  onClick={onFixAll}
                  disabled={hasMultipleInstalls}
                  aria-label={
                    hasMultipleInstalls
                      ? "Fix disabled — multiple TallyPrime installs detected. Uninstall the unused copy first."
                      : undefined
                  }
                  className={`bg-tm-blue text-white py-1.5 px-4 rounded font-medium text-sm hover:opacity-90${hasMultipleInstalls ? " opacity-50 cursor-not-allowed" : ""}`}
                >
                  {hasMultipleInstalls
                    ? "Fix both (disabled — multiple installs)"
                    : status.isElevated === false
                      ? "Fix both (Admin needed) →"
                      : "Fix both, continue →"}
                </button>
              </div>
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
