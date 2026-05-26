import type { ClientId } from "../../shared/ipc-types.js";

export interface AddMcpModalProps {
  clientId: ClientId;
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
  onShowSmartScreenGuide: () => void;
}

export function AddMcpModal({
  clientId,
  displayName,
  onConfirm,
  onCancel,
  onShowSmartScreenGuide,
}: AddMcpModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add TallyMCP to ${displayName}`}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-tm-bg rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-tm-border">
        <div className="bg-tm-card border-b border-tm-border px-5 py-3 font-semibold text-tm-text">
          Add MCP to {displayName}
        </div>
        <div className="grid grid-cols-2 gap-5 p-5">
          {/* LEFT: action panel */}
          <div className="bg-tm-card border border-tm-border rounded-lg p-4">
            <div className="text-xs text-tm-text-muted uppercase tracking-wider mb-1">
              Step 1 of 1
            </div>
            <div className="text-lg font-semibold mb-4">Add TallyMCP to {displayName}</div>
            <div className="mb-4 p-2 bg-tm-code-bg border border-tm-border rounded text-sm">
              <div className="text-xs text-tm-text-muted mb-1">AI tool</div>
              <div className="font-medium">{displayName}</div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 bg-tm-blue text-white py-2 px-5 rounded font-semibold hover:opacity-90"
              >
                Add MCP
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="border border-tm-border bg-tm-card py-2 px-4 rounded hover:bg-tm-bg"
              >
                Cancel
              </button>
            </div>
            <div className="text-xs text-tm-text-muted text-center mt-2">
              Takes ~2 seconds. Reversible from the main screen.
            </div>
          </div>

          {/* RIGHT: info box */}
          <div className="bg-tm-card border border-tm-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-3 font-semibold text-sm">
              <span className="inline-flex w-4 h-4 bg-tm-blue text-white rounded-full items-center justify-center text-xs">
                i
              </span>
              <span>What will change on your PC</span>
            </div>
            <div className="bg-tm-code-bg border-l-[3px] border-tm-blue p-3 rounded mb-4 text-sm leading-relaxed">
              <div className="font-semibold mb-2">I will do exactly 3 things:</div>
              <ol className="space-y-1.5">
                <li>
                  <strong>Add one new entry</strong> named "tallymcp-pro" to {displayName}'s list of
                  AI servers.
                </li>
                <li>
                  <strong>Save a backup</strong> of your current {displayName} settings file before
                  I change anything.
                </li>
                <li>
                  <strong>Tell you to restart {displayName}</strong> so it picks up the new
                  connector.
                </li>
              </ol>
            </div>
            <div className="bg-tm-green-soft border border-tm-green-deep p-3 rounded mb-4 text-sm leading-relaxed">
              <div className="font-semibold mb-1.5 text-tm-green-deep">
                ✓ What WILL NOT happen
              </div>
              <div>• Your other AI servers will not be removed or changed.</div>
              <div>• Your {displayName} chat history is not touched.</div>
              <div>• Your TallyPrime data is never modified — TallyMCP is read-only.</div>
              <div>• No data leaves your computer.</div>
            </div>
            <div className="border-t border-tm-border pt-3 text-xs text-tm-text-muted">
              <div className="mb-1">Settings file I'll edit:</div>
              <code className="text-xs font-mono">
                {clientId === "claude-desktop" && "%APPDATA%\\Claude\\claude_desktop_config.json"}
                {clientId === "cursor" && "%USERPROFILE%\\.cursor\\mcp.json"}
                {clientId === "claude-code" && "%USERPROFILE%\\.claude.json"}
                {clientId === "lm-studio" && "%USERPROFILE%\\.lmstudio\\mcp.json"}
                {clientId === "ollama" && "%LOCALAPPDATA%\\TallyMCP\\ollama-bridge\\config.json"}
              </code>
            </div>
            <div className="mt-3 p-3 bg-tm-amber-soft border border-tm-amber-border rounded text-xs leading-relaxed">
              <div className="font-semibold mb-1">🛡️ If Windows says "Unknown publisher"</div>
              <div>
                TallyMCP is currently signed with a free certificate while we collect feedback.{" "}
                <button
                  type="button"
                  onClick={onShowSmartScreenGuide}
                  className="text-tm-blue underline font-medium"
                >
                  Show me what to click →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
