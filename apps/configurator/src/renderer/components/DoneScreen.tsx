import type { ClientId, ClientConfigVariant } from "../../shared/ipc-types.js";

export interface DoneScreenProps {
  clientId: ClientId;
  clientDisplayName: string;
  /**
   * v1.0.3 (#140): variant flavors of the config paths actually written.
   * For Claude Desktop, `["standard", "msix"]` means we wrote to BOTH the
   * standalone and Microsoft Store sandbox. The MSIX flavor needs an extra
   * caveat because Store-version Claude Desktop runs in an AppContainer
   * and may have trouble spawning the local node.exe child process.
   *
   * For non–Claude-Desktop clients (cursor, claude-code, lm-studio, ollama)
   * this is always `["standard"]` and only affects the restart copy.
   */
  variants: ClientConfigVariant[];
  onClose: () => void;
}

export function DoneScreen({
  clientId,
  clientDisplayName,
  variants,
  onClose,
}: DoneScreenProps): JSX.Element {
  const isClaudeDesktop = clientId === "claude-desktop";
  const hasMsix = variants.includes("msix");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`TallyMCP wired into ${clientDisplayName}`}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-tm-green-soft border border-tm-green-deep rounded-lg max-w-xl w-full p-6">
        <div className="text-5xl mb-3 text-center">✓</div>
        <div className="font-bold text-lg text-tm-green-deep mb-3 text-center">
          TallyMCP is wired into {clientDisplayName}
        </div>

        {/* Restart instruction — different copy for Claude Desktop vs others */}
        {isClaudeDesktop ? (
          <div data-testid="tray-quit-instructions" className="text-sm mb-4 leading-relaxed">
            <div className="font-medium mb-2 text-tm-text">
              Important: Fully quit {clientDisplayName} so it reloads the config.
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-tm-text">
              <li>
                Right-click the <strong>{clientDisplayName} icon in the system tray</strong>
                {" "}(bottom-right, near the clock) → <strong>Quit</strong>.
                <div className="text-xs text-tm-text-muted mt-0.5">
                  Closing the window isn't enough — the config is only loaded at process start.
                </div>
              </li>
              <li>Reopen {clientDisplayName} from the Start menu.</li>
              <li>
                Test by asking:{" "}
                <span className="italic">"Call the test_connection tool from tallymcp-pro."</span>
              </li>
            </ol>
          </div>
        ) : (
          <div className="text-sm mb-4 leading-relaxed text-tm-text">
            Restart {clientDisplayName}, then ask it something like:
            <div className="mt-3 italic bg-tm-card border border-tm-green-deep p-3 rounded text-tm-text">
              "What's my sales for FY 22-23?"
            </div>
          </div>
        )}

        {/* MSIX/Store caveat — only when an MSIX path was written.
            Uses the existing tm-amber-* palette (tm-yellow-* does NOT exist
            in apps/configurator/tailwind.config.ts per Cursor review 2026-05-27). */}
        {hasMsix && (
          <div
            data-testid="msix-caveat-card"
            className="text-sm mb-4 p-3 rounded bg-tm-amber-soft border border-tm-amber-border"
          >
            <div className="font-medium text-tm-blue-deep mb-1">
              ⚠ Microsoft Store version detected
            </div>
            <div className="text-tm-text">
              We wrote the config to the Store-version sandbox. The Store
              version runs in a Windows AppContainer and sometimes can't
              launch local MCP servers like ours.
              <div className="mt-2">
                If MCP tools don't appear after restart, install the regular
                {" "}<strong>standalone</strong> Claude Desktop from{" "}
                <span className="font-mono">claude.ai/download</span> — it
                has fewer sandbox restrictions and will pick up the same
                config automatically.
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-tm-text-muted mb-4 text-center">
          You can remove this connection anytime from the TallyMCP home screen.
        </div>
        <div className="text-center">
          <button type="button" onClick={onClose}
            className="bg-tm-blue text-white py-2 px-6 rounded font-medium hover:opacity-90">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
