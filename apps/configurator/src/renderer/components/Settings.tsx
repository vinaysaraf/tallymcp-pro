import { useState } from "react";
import type { ConfigSnapshot } from "../../shared/ipc-types.js";

export interface SettingsProps {
  config: ConfigSnapshot;
  onRestoreTallySettings: () => void;
  onReCheck: () => void;
  /** Persists the Tally location (This PC / Server host:port). */
  onSaveTallyConnection: (host: string, port: number) => Promise<void>;
}

type Mode = "local" | "server";

const LOCAL_HOST = "127.0.0.1";
const DEFAULT_PORT = 9000;
// Bare hostname / IPv4 only — rejects schemes, slashes, ports, credentials, IPv6.
// Mirrors the authoritative check in the main process (writeTallyConnection).
const HOST_RE = /^[A-Za-z0-9._-]+$/;

export function Settings({
  config,
  onRestoreTallySettings,
  onReCheck,
  onSaveTallyConnection,
}: SettingsProps): JSX.Element {
  const initialMode: Mode = config.tallyConnectionType === "local" ? "local" : "server";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [host, setHost] = useState<string>(
    initialMode === "local" ? "" : config.tallyHost,
  );
  const [port, setPort] = useState<string>(String(config.tallyPort || DEFAULT_PORT));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSave = async (): Promise<void> => {
    setError(undefined);
    setSaved(false);
    const effectiveHost = mode === "local" ? LOCAL_HOST : host.trim();
    const portNum = Number(port);
    if (mode === "server" && !effectiveHost) {
      setError("Enter the server's IP address or hostname (e.g. 192.168.1.50).");
      return;
    }
    if (mode === "server" && !HOST_RE.test(effectiveHost)) {
      setError(
        'Enter just a hostname or IPv4 address (e.g. 192.168.1.50 or tally-server) — no "http://", slashes, or port. Put the port in the Port field.',
      );
      return;
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError("Port must be a whole number between 1 and 65535 (Tally's default is 9000).");
      return;
    }
    setSaving(true);
    try {
      await onSaveTallyConnection(effectiveHost, portNum);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-tm-card border border-tm-border rounded-lg p-5 text-sm text-tm-text">
      <div className="font-bold text-tm-blue-deep mb-4">Settings</div>

      {/* ── Tally location ─────────────────────────────────────────────── */}
      <div className="font-semibold text-tm-text mb-1">Where is TallyPrime?</div>
      <div className="text-tm-text-muted text-xs mb-3">
        Connect to Tally on this computer, or on your office server — no config file editing.
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="tally-location"
            checked={mode === "local"}
            onChange={() => {
              setMode("local");
              setSaved(false);
              setError(undefined);
            }}
          />
          <span>This PC <span className="text-tm-text-muted">({LOCAL_HOST}:{DEFAULT_PORT})</span></span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="tally-location"
            checked={mode === "server"}
            onChange={() => {
              setMode("server");
              setSaved(false);
              setError(undefined);
            }}
          />
          <span>Server / another PC on the network</span>
        </label>
      </div>

      <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 items-center max-w-md mb-3">
        <label htmlFor="tally-host" className="text-tm-text-muted">Host / IP</label>
        <input
          id="tally-host"
          type="text"
          value={mode === "local" ? LOCAL_HOST : host}
          disabled={mode === "local"}
          placeholder="e.g. 192.168.1.50 or tally-server"
          onChange={(e) => {
            setHost(e.target.value);
            setSaved(false);
          }}
          className="border border-tm-border rounded px-2 py-1 font-mono text-xs disabled:bg-tm-bg disabled:text-tm-text-muted"
        />
        <label htmlFor="tally-port" className="text-tm-text-muted">Port</label>
        <input
          id="tally-port"
          type="text"
          inputMode="numeric"
          value={port}
          onChange={(e) => {
            setPort(e.target.value);
            setSaved(false);
          }}
          className="border border-tm-border rounded px-2 py-1 font-mono text-xs w-28"
        />
      </div>

      {error !== undefined && (
        <div role="alert" className="text-red-600 text-xs mb-2">{error}</div>
      )}
      {saved && (
        <div role="status" className="text-tm-green-deep text-xs mb-2">
          Saved. The next time your AI assistant starts the connection, it will use this Tally.
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-6">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-tm-blue text-white py-2 px-4 rounded font-medium text-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Tally location"}
        </button>
      </div>

      {/* ── Paths + maintenance ────────────────────────────────────────── */}
      <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 border-t border-tm-border pt-4">
        <div className="text-tm-text-muted">TallyMCP install</div>
        <code className="font-mono text-xs">{config.installDir}</code>

        <div className="text-tm-text-muted">TallyPrime folder</div>
        <code className="font-mono text-xs">{config.tallyInstallDir ?? "(not detected)"}</code>

        <div className="text-tm-text-muted">Version</div>
        <span>{config.version}</span>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={onReCheck}
          className="bg-tm-blue text-white py-2 px-4 rounded font-medium text-sm hover:opacity-90"
        >
          Run health check
        </button>
        <button
          type="button"
          onClick={onRestoreTallySettings}
          className="border border-tm-border bg-tm-card py-2 px-4 rounded text-sm hover:bg-tm-bg"
        >
          Restore Tally settings (undo XML + firewall)
        </button>
      </div>
    </div>
  );
}
