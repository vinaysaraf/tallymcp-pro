export interface ITPolicyHelpModalProps {
  /**
   * Absolute path to the detected tally.exe (e.g.
   * `C:\Program Files\TallyPrime\tally.exe`). Substituted into the
   * `program=` arg of the netsh + PowerShell commands so the rule the
   * user shows IT actually matches their install (Cursor M2, 2026-05-26).
   * Phase 3.1 supports a single install; multi-install picker is Phase
   * 2's `resolveSingleInstall` follow-up (deferred — see plan §"Out of
   * scope").
   */
  tallyExePath: string;
  onClose: () => void;
}

/**
 * Modal shown when the Group Policy error fires during the firewall add
 * attempt (Phase 3.1 Patch D). Gives the user three actionable paths:
 *
 *   1. The exact `netsh` command their IT team can run to add the rule.
 *   2. The equivalent `New-NetFirewallRule` PowerShell command for newer
 *      Windows (Server 2012+, Windows 8+) — both are functionally
 *      identical; PowerShell is just the modern API.
 *   3. The "skip if loopback-only" reassurance — if the user only uses
 *      AI tools on this same PC, they don't need the firewall rule at
 *      all (Tally listens on 127.0.0.1:9000, MCP server connects on the
 *      same loopback interface, no firewall traversal needed).
 *
 * Closeable via the dismiss button OR a backdrop click (matches Phase 2
 * modal pattern — SmartScreenGuide / AddMcpModal etc.).
 */
export function ITPolicyHelpModal({ tallyExePath, onClose }: ITPolicyHelpModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="IT policy firewall guidance"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-tm-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-tm-border">
        <div className="bg-tm-card border-b border-tm-border px-5 py-3 font-semibold text-tm-text">
          Your IT policy blocks firewall changes — here are your options
        </div>
        <div className="p-5 text-sm text-tm-text leading-relaxed">
          <div className="bg-tm-green-soft border border-tm-green-deep p-3 rounded mb-4">
            <div className="font-semibold text-tm-green-deep mb-1">
              ✓ Most likely you can skip this entirely
            </div>
            <div>
              You can <strong>skip this rule if you only use AI tools on this
              same PC</strong>. Tally listens on <code className="font-mono text-xs">127.0.0.1:9000</code>{" "}
              (loopback only), and the MCP server connects to it from the same
              machine. No firewall traversal happens — the rule is only needed
              when Tally and the AI tool run on different PCs.
            </div>
          </div>

          <div className="mb-4">
            <div className="font-semibold mb-1">
              If you do need the rule (multi-PC setup), give one of these to IT:
            </div>
            <div className="text-xs text-tm-text-muted mb-2">
              Both add the same Windows Firewall rule — pick whichever is
              easier for IT to run.
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-tm-text-muted mb-1">
              Classic <code className="font-mono">netsh</code> (Command Prompt as Administrator):
            </div>
            <pre className="bg-tm-code-bg border border-tm-border rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`netsh advfirewall firewall add rule name="TallyMCP — Tally XML port 9000" dir=in action=allow protocol=TCP localport=9000 program="${tallyExePath}" profile=private enable=yes`}
            </pre>
          </div>

          <div className="mb-4">
            <div className="text-xs text-tm-text-muted mb-1">
              PowerShell (also as Administrator):
            </div>
            <pre className="bg-tm-code-bg border border-tm-border rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`New-NetFirewallRule -DisplayName "TallyMCP — Tally XML port 9000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9000 -Program "${tallyExePath}" -Profile Private`}
            </pre>
          </div>

          <div className="flex justify-end pt-3 border-t border-tm-border">
            <button
              type="button"
              onClick={onClose}
              className="bg-tm-blue text-white py-2 px-5 rounded font-medium hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
