export interface ResetConfigModalProps {
  clientDisplayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms a "Reset config" — restore the most recent backup TallyMCP saved
 * for this client. The current file is itself backed up first, so the reset is
 * reversible. The dated success message is shown by the caller after restore.
 */
export function ResetConfigModal({
  clientDisplayName,
  onConfirm,
  onCancel,
}: ResetConfigModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reset ${clientDisplayName} configuration`}
      data-testid="reset-config-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-tm-card rounded-lg max-w-md w-full border border-tm-border p-6">
        <div className="font-bold text-tm-blue-deep text-lg mb-3">
          Reset {clientDisplayName} configuration?
        </div>
        <div className="text-sm leading-relaxed mb-4 text-tm-text">
          We'll restore the most recent backup TallyMCP saved for {clientDisplayName}.
          Use this if {clientDisplayName} stopped working or its config looks wrong after a change.
        </div>
        <div className="bg-tm-code-bg border-l-[3px] border-tm-blue p-3 rounded mb-4 text-xs leading-relaxed text-tm-text">
          Your current config is backed up first, so this is reversible. After restoring,
          fully quit {clientDisplayName} from the system tray and reopen it.
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="border border-tm-border bg-tm-card py-2 px-4 rounded hover:bg-tm-bg">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            data-testid="reset-config-confirm-button"
            className="bg-tm-blue text-white py-2 px-5 rounded font-semibold hover:opacity-90">
            Reset config
          </button>
        </div>
      </div>
    </div>
  );
}
