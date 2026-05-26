export interface RestoreConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestoreConfirmModal({ onConfirm, onCancel }: RestoreConfirmModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Restore Tally settings"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-tm-card rounded-lg max-w-xl w-full border border-tm-border p-6">
        <div className="font-bold text-tm-blue-deep text-lg mb-3">Restore Tally settings</div>
        <div className="bg-tm-code-bg border-l-[3px] border-tm-blue p-3 rounded mb-4 text-sm leading-relaxed">
          <div className="font-semibold mb-2">I will undo 2 changes:</div>
          <ol className="space-y-1.5 list-decimal list-inside">
            <li><strong>tally.ini</strong> will be restored from backup (Client Server / ServerPort lines removed).</li>
            <li>The Windows <strong>Firewall rule</strong> "TallyMCP — Tally XML port 9000" will be removed (skipped if not admin).</li>
          </ol>
        </div>
        <div className="bg-tm-amber-soft border border-tm-amber-border p-3 rounded mb-4 text-xs leading-relaxed">
          ⚠ After this, you'll need to manually enable the XML interface in Tally before running queries again.
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="border border-tm-border bg-tm-card py-2 px-4 rounded hover:bg-tm-bg">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="bg-tm-blue text-white py-2 px-5 rounded font-semibold hover:opacity-90">
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}
