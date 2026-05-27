import type { ClientId } from "../../shared/ipc-types.js";

export interface ClientTileProps {
  clientId: ClientId;
  displayName: string;
  configured: boolean;
  onAdd: (clientId: ClientId) => void;
  onReconfigure: (clientId: ClientId) => void;
  /** Opens the disconnect confirm modal for this client (#141). */
  onDisconnect: (clientId: ClientId) => void;
}

export function ClientTile({
  clientId,
  displayName,
  configured,
  onAdd,
  onReconfigure,
  onDisconnect,
}: ClientTileProps): JSX.Element {
  return (
    <div className="bg-tm-card border border-tm-border rounded-lg p-3 text-sm text-tm-text">
      <div className="font-semibold">{displayName}</div>
      <div className={configured ? "text-tm-green-deep my-1" : "text-tm-text-muted my-1"}>
        {configured ? "✓ Connected" : "Not added"}
      </div>
      {configured ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            className="px-2 py-1 text-xs border border-tm-border rounded bg-tm-card hover:bg-tm-bg"
            onClick={() => onReconfigure(clientId)}
          >
            Reconfigure
          </button>
          <button
            type="button"
            aria-label={`Disconnect TallyMCP from ${displayName}`}
            data-testid={`disconnect-${clientId}`}
            className="px-2 py-1 text-xs border border-red-700 text-red-700 rounded bg-tm-card hover:bg-red-50"
            onClick={() => onDisconnect(clientId)}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="px-2 py-1 text-xs bg-tm-blue text-white rounded hover:opacity-90"
          onClick={() => onAdd(clientId)}
        >
          + Add MCP
        </button>
      )}
    </div>
  );
}
