export interface DisconnectConfirmModalProps {
  clientDisplayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DisconnectConfirmModal({
  clientDisplayName,
  onConfirm,
  onCancel,
}: DisconnectConfirmModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Disconnect TallyMCP from ${clientDisplayName}`}
      data-testid="disconnect-confirm-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-tm-card rounded-lg max-w-md w-full border border-tm-border p-6">
        <div className="font-bold text-tm-blue-deep text-lg mb-3">
          Disconnect TallyMCP from {clientDisplayName}?
        </div>
        <div className="text-sm leading-relaxed mb-4 text-tm-text">
          We'll surgically remove only the <span className="font-mono">tallymcp-pro</span> entry from {clientDisplayName}'s config.
          This won't affect any other MCP servers, your data, or {clientDisplayName}'s own settings.
        </div>
        <div className="bg-tm-code-bg border-l-[3px] border-tm-blue p-3 rounded mb-4 text-xs leading-relaxed text-tm-text">
          You can reconnect anytime by clicking <strong>+ Add MCP</strong> on the home screen.
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="border border-tm-border bg-tm-card py-2 px-4 rounded hover:bg-tm-bg">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            data-testid="disconnect-confirm-button"
            className="bg-red-700 text-white py-2 px-5 rounded font-semibold hover:bg-red-800">
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
