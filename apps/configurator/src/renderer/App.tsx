import { useEffect, useState } from "react";
import { useAppStore } from "./store.js";
import { getApi } from "./api.js";
import { StatusBanner } from "./components/StatusBanner.js";
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
    const api = getApi();
    try {
      // config may still be loading on first render; resolve lazily if needed
      const cfg = config ?? (await api.getConfig());
      await api.wireMcp({ clientId: modalFor, installDir: cfg.installDir });
      markClientConfigured(modalFor);
      const wiredClient = modalFor;
      setModalFor(undefined);
      setShowDoneFor(wiredClient);  // show DoneScreen after success
    } catch (err) {
      useAppStore.getState().setLastError((err as Error).message);
    }
  };

  const handleFixAll = async (): Promise<void> => {
    const api = getApi();
    await api.tallyFix();
    setHealth(await api.healthCheck());
  };

  // Opens the RestoreConfirmModal instead of restoring immediately.
  const handleRestoreClick = (): void => setShowRestoreConfirm(true);

  const handleRestoreConfirmed = async (): Promise<void> => {
    const api = getApi();
    setShowRestoreConfirm(false);
    await api.tallyRestore();
    setHealth(await api.healthCheck());
  };

  const handleReCheck = async (): Promise<void> => {
    setHealth(await getApi().healthCheck());
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
