import { ClientTile } from "./ClientTile.js";
import type { ClientId } from "../../shared/ipc-types.js";

const CLIENT_DISPLAY: Array<{ id: ClientId; name: string }> = [
  { id: "claude-desktop", name: "Claude Desktop" },
  { id: "cursor", name: "Cursor" },
  { id: "claude-code", name: "Claude Code" },
  { id: "lm-studio", name: "LM Studio" },
  { id: "ollama", name: "Ollama" },
];

export interface TileGridProps {
  configuredClients: Set<ClientId>;
  /** Clients with a restorable backup — used to show "Reset config" on un-configured tiles. */
  restorableClients?: Set<ClientId>;
  onAdd: (clientId: ClientId) => void;
  onReconfigure: (clientId: ClientId) => void;
  onDisconnect: (clientId: ClientId) => void;
  onReset: (clientId: ClientId) => void;
}

export function TileGrid({
  configuredClients,
  restorableClients,
  onAdd,
  onReconfigure,
  onDisconnect,
  onReset,
}: TileGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CLIENT_DISPLAY.map(({ id, name }) => (
        <ClientTile
          key={id}
          clientId={id}
          displayName={name}
          configured={configuredClients.has(id)}
          restorable={restorableClients?.has(id) ?? false}
          onAdd={onAdd}
          onReconfigure={onReconfigure}
          onDisconnect={onDisconnect}
          onReset={onReset}
        />
      ))}
    </div>
  );
}
