import type { ClientId } from "../../shared/ipc-types.js";

export interface DoneScreenProps {
  clientId: ClientId;
  clientDisplayName: string;
  onClose: () => void;
}

export function DoneScreen({ clientId: _clientId, clientDisplayName, onClose }: DoneScreenProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`TallyMCP wired into ${clientDisplayName}`}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-tm-green-soft border border-tm-green-deep rounded-lg max-w-xl w-full p-6 text-center">
        <div className="text-5xl mb-3">✓</div>
        <div className="font-bold text-lg text-tm-green-deep mb-3">
          TallyMCP is wired into {clientDisplayName}
        </div>
        <div className="text-sm mb-5 leading-relaxed">
          Restart {clientDisplayName}, then ask it something like:
          <div className="mt-3 italic bg-tm-card border border-tm-green-deep p-3 rounded text-tm-text">
            "What's my sales for FY 22-23?"
          </div>
        </div>
        <div className="text-xs text-tm-text-muted mb-4">
          You can remove this connection anytime from the TallyMCP home screen.
        </div>
        <button type="button" onClick={onClose}
          className="bg-tm-blue text-white py-2 px-6 rounded font-medium hover:opacity-90">
          Close
        </button>
      </div>
    </div>
  );
}
