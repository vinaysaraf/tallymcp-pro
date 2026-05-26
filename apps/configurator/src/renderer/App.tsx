import { useEffect, useState } from "react";
import { useAppStore } from "./store.js";
import { getApi } from "./api.js";
import { StatusBanner } from "./components/StatusBanner.js";
import { ErrorBanner } from "./components/ErrorBanner.js";
import { TileGrid } from "./components/TileGrid.js";
import { AddMcpModal } from "./components/AddMcpModal.js";
import { HealthCheck } from "./components/HealthCheck.js";
import { Settings } from "./components/Settings.js";
import { SmartScreenGuide } from "./components/SmartScreenGuide.js";
import { DoneScreen } from "./components/DoneScreen.js";
import { RestoreConfirmModal } from "./components/RestoreConfirmModal.js";
import type {
  ClientId,
  ConfigSnapshot,
  HealthCheckResponse,
} from "../shared/ipc-types.js";

const CLIENT_DISPLAY_NAMES: Record<ClientId, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  "claude-code": "Claude Code",
  "lm-studio": "LM Studio",
  ollama: "Ollama",
};

export function App(): JSX.Element {
  const currentScreen = useAppStore((s) => s.currentScreen);
  const navigateTo = useAppStore((s) => s.navigateTo);
  const tallyStatus = useAppStore((s) => s.tallyStatus);
  const setTallyStatus = useAppStore((s) => s.setTallyStatus);
  const configuredClients = useAppStore((s) => s.configuredClients);
  const markClientConfigured = useAppStore((s) => s.markClientConfigured);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const unmarkClientConfigured = useAppStore((s) => s.unmarkClientConfigured);
  const lastError = useAppStore((s) => s.lastError);
  const setLastError = useAppStore((s) => s.setLastError);
  const clearLastError = useAppStore((s) => s.clearLastError);

  const [config, setConfig] = useState<ConfigSnapshot | undefined>(undefined);
  const [health, setHealth] = useState<HealthCheckResponse | undefined>(undefined);
  const [modalFor, setModalFor] = useState<ClientId | undefined>(undefined);
  const [showSmartScreen, setShowSmartScreen] = useState(false);
  const [showDoneFor, setShowDoneFor] = useState<ClientId | undefined>(undefined);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Initial load
  useEffect(() => {
    const api = getApi();
    void api.getConfig().then(setConfig);
    // H5: hydrate Zustand from the probed configuredClients list so tiles
    // reflect the actual state of AI client configs on disk after restart.
    void api.healthCheck().then((h) => {
      setHealth(h);
      h.configuredClients.forEach((id) => markClientConfigured(id));
    });
    const unsub = api.subscribeTallyStatus(setTallyStatus);
    return unsub;
  }, [setTallyStatus, markClientConfigured]);

  const handleAdd = (clientId: ClientId): void => setModalFor(clientId);
  const handleReconfigure = (clientId: ClientId): void => setModalFor(clientId);

  const handleConfirmAdd = async (): Promise<void> => {
    if (!modalFor) return;
    // installDir is no longer renderer-supplied — main injects it from
    // its canonical %LOCALAPPDATA%\TallyMCP resolution (Cursor review H1).
    // This also removes the prior race where wireMcp could fire before
    // the initial getConfig() promise settled.
    const api = getApi();
    try {
      await api.wireMcp({ clientId: modalFor });
      markClientConfigured(modalFor);
      const wiredClient = modalFor;
      setModalFor(undefined);
      setShowDoneFor(wiredClient);  // show DoneScreen after success
      clearLastError();  // success → wipe any prior error state (M1)
    } catch (err) {
      setLastError((err as Error).message);
    }
  };

  // M3: all Tally-* IPC calls can throw (e.g. "Multiple TallyPrime installs
  // found" — see ipc-handlers.ts resolveSingleInstall). Wrap so failures
  // surface via ErrorBanner instead of becoming unhandled rejections.

  const handleFixAll = async (): Promise<void> => {
    const api = getApi();
    try {
      await api.tallyFix();
      setHealth(await api.healthCheck());
      clearLastError();
    } catch (err) {
      setLastError((err as Error).message);
    }
  };

  // Opens the RestoreConfirmModal instead of restoring immediately.
  const handleRestoreClick = (): void => setShowRestoreConfirm(true);

  const handleRestoreConfirmed = async (): Promise<void> => {
    const api = getApi();
    setShowRestoreConfirm(false);
    try {
      await api.tallyRestore();
      setHealth(await api.healthCheck());
      clearLastError();
    } catch (err) {
      setLastError((err as Error).message);
    }
  };

  const handleReCheck = async (): Promise<void> => {
    try {
      setHealth(await getApi().healthCheck());
      clearLastError();
    } catch (err) {
      setLastError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen p-5 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div className="font-semibold text-tm-blue-deep text-lg">TallyMCP Configurator</div>
        <nav className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigateTo("home")}
            className={`px-3 py-1 rounded ${currentScreen === "home" ? "bg-tm-blue text-white" : "text-tm-text-muted hover:bg-tm-bg"}`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => navigateTo("health-check")}
            className={`px-3 py-1 rounded ${currentScreen === "health-check" ? "bg-tm-blue text-white" : "text-tm-text-muted hover:bg-tm-bg"}`}
          >
            Health Check
          </button>
          <button
            type="button"
            onClick={() => navigateTo("settings")}
            className={`px-3 py-1 rounded ${currentScreen === "settings" ? "bg-tm-blue text-white" : "text-tm-text-muted hover:bg-tm-bg"}`}
          >
            Settings
          </button>
        </nav>
      </header>

      <StatusBanner
        tallyStatus={tallyStatus}
        serverHealthy={tallyStatus.reachable}
        version={config?.version ?? ""}
      />

      {lastError !== undefined && (
        <ErrorBanner message={lastError} onDismiss={clearLastError} />
      )}

      {currentScreen === "home" && (
        <TileGrid
          configuredClients={configuredClients}
          onAdd={handleAdd}
          onReconfigure={handleReconfigure}
        />
      )}
      {currentScreen === "health-check" && health && (
        <HealthCheck status={health} onFixAll={handleFixAll} onReCheck={handleReCheck} />
      )}
      {currentScreen === "settings" && config && (
        <Settings config={config} onRestoreTallySettings={handleRestoreClick} onReCheck={handleReCheck} />
      )}

      {modalFor !== undefined && (
        <AddMcpModal
          clientId={modalFor}
          displayName={CLIENT_DISPLAY_NAMES[modalFor]}
          onConfirm={handleConfirmAdd}
          onCancel={() => setModalFor(undefined)}
          onShowSmartScreenGuide={() => setShowSmartScreen(true)}
        />
      )}
      {showSmartScreen && <SmartScreenGuide onClose={() => setShowSmartScreen(false)} />}
      {showDoneFor !== undefined && (
        <DoneScreen
          clientId={showDoneFor}
          clientDisplayName={CLIENT_DISPLAY_NAMES[showDoneFor]}
          onClose={() => setShowDoneFor(undefined)}
        />
      )}
      {showRestoreConfirm && (
        <RestoreConfirmModal
          onConfirm={handleRestoreConfirmed}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
    </div>
  );
}
