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
  onAdd: (clientId: ClientId) => void;
  onReconfigure: (clientId: ClientId) => void;
}

export function TileGrid({
  configuredClients,
  onAdd,
  onReconfigure,
}: TileGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CLIENT_DISPLAY.map(({ id, name }) => (
        <ClientTile
          key={id}
          clientId={id}
          displayName={name}
          configured={configuredClients.has(id)}
          onAdd={onAdd}
          onReconfigure={onReconfigure}
        />
      ))}
    </div>
  );
}
