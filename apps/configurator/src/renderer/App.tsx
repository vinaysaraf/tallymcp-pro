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
import { ITPolicyHelpModal } from "./components/ITPolicyHelpModal.js";
import { UpdateBanner } from "./components/UpdateBanner.js";
import type {
  ClientId,
  ClientConfigVariant,
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
  const firewallSkipReason = useAppStore((s) => s.firewallSkipReason);
  const setFirewallSkipReason = useAppStore((s) => s.setFirewallSkipReason);
  const clearFirewallSkipReason = useAppStore((s) => s.clearFirewallSkipReason);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const updateDismissedThisSession = useAppStore((s) => s.updateDismissedThisSession);
  const dismissUpdate = useAppStore((s) => s.dismissUpdate);

  const [config, setConfig] = useState<ConfigSnapshot | undefined>(undefined);
  const [health, setHealth] = useState<HealthCheckResponse | undefined>(undefined);
  const [modalFor, setModalFor] = useState<ClientId | undefined>(undefined);
  const [showSmartScreen, setShowSmartScreen] = useState(false);
  const [showDoneFor, setShowDoneFor] = useState<ClientId | undefined>(undefined);
  const [doneVariants, setDoneVariants] = useState<ClientConfigVariant[]>(["standard"]);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showITPolicyModal, setShowITPolicyModal] = useState(false);

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
    // Phase 4: update-status subscription.
    const unsubUpdate = api.subscribeUpdateStatus(setUpdateStatus);
    // The main process triggers an initial check 5s after launch; we ALSO
    // call once here so a renderer reload during dev gets the current state.
    void api.checkForUpdates()
      .then(setUpdateStatus)
      .catch(() => { /* main process logs; banner stays hidden */ });
    return () => {
      unsub();
      unsubUpdate();
    };
  }, [setTallyStatus, markClientConfigured, setUpdateStatus]);

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
      const result = await api.wireMcp({ clientId: modalFor });
      markClientConfigured(modalFor);
      const wiredClient = modalFor;
      setModalFor(undefined);
      setDoneVariants(result.variants);
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
      const result = await api.tallyFix();
      // Phase 3.1 Patch A + D + Cursor H3 (2026-05-26): surface the
      // firewall outcome BEFORE the healthCheck() refresh. If the
      // refresh throws, the user still sees the yellow card / IT-policy
      // modal — the fix DID succeed; only the displayed status would
      // be stale.
      // (Note: firewallSkipReason: "group-policy" is intentionally
      // routed to ITPolicyHelpModal, not the Patch A yellow card —
      // see HealthCheck.tsx Patch A guard at `=== "non-admin"`. The
      // store keeps the reason set so post-skip Re-check logic in
      // HealthCheck.tsx works for both cases — Cursor M5.)
      if (result.firewallRule === "skipped-non-admin") {
        setFirewallSkipReason("non-admin");
        clearLastError();
      } else if (result.firewallRule === "group-policy-blocked") {
        setFirewallSkipReason("group-policy");
        setShowITPolicyModal(true);
        clearLastError();
      } else {
        // "added" or "noop" — successful path; clear any prior skip state.
        clearFirewallSkipReason();
        clearLastError();
      }
      // Refresh the displayed status. Wrap separately so a healthCheck
      // failure surfaces in lastError but does NOT drop the firewall UX
      // (Cursor H3, 2026-05-26).
      try {
        setHealth(await api.healthCheck());
      } catch (refreshErr) {
        setLastError(`Couldn't refresh status: ${(refreshErr as Error).message}`);
      }
    } catch (err) {
      // tallyFix() itself threw — likely a TallyIniLockedError (Task 2),
      // a non-firewall error, or an IPC transport failure. Surface via
      // existing ErrorBanner path; no firewall state changes apply.
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

  const handleUpdateClick = async (): Promise<void> => {
    try {
      await getApi().downloadUpdate();
    } catch (err) {
      setLastError(`Update failed: ${(err as Error).message}`);
    }
  };

  const handleWhatsNewClick = (): void => {
    const url = updateStatus?.releaseNotesUrl;
    if (url) window.open(url, "_blank", "noopener");
  };

  const handleRestartClick = async (): Promise<void> => {
    try {
      await getApi().quitAndInstall();
    } catch (err) {
      setLastError(`Restart failed: ${(err as Error).message}`);
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

      {updateStatus && !updateDismissedThisSession && (
        <UpdateBanner
          status={updateStatus}
          onUpdateClick={handleUpdateClick}
          onWhatsNewClick={handleWhatsNewClick}
          onDismiss={dismissUpdate}
          onRestartClick={handleRestartClick}
        />
      )}

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
        <HealthCheck
          status={health}
          firewallSkipReason={firewallSkipReason}
          onFixAll={handleFixAll}
          onReCheck={handleReCheck}
        />
      )}
      {currentScreen === "settings" && config && (
        <Settings config={config} onRestoreTallySettings={handleRestoreClick} onReCheck={handleReCheck} />
      )}

      {modalFor !== undefined && (
        <AddMcpModal
          clientId={modalFor}
          displayName={CLIENT_DISPLAY_NAMES[modalFor]}
          msixDetected={health?.claudeDesktopVariants?.includes("msix") ?? false}
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
          variants={doneVariants}
          onClose={() => setShowDoneFor(undefined)}
        />
      )}
      {showRestoreConfirm && (
        <RestoreConfirmModal
          onConfirm={handleRestoreConfirmed}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
      {showITPolicyModal && (
        <ITPolicyHelpModal
          // Cursor M2 (2026-05-26): substitute the user's actual install
          // path into the netsh/PowerShell commands. Fall back to the
          // Program Files default only if health didn't populate a
          // tallyInstallDir yet (modal shouldn't open without a real
          // detect — but defend against the race).
          tallyExePath={
            health?.tallyInstallDir
              ? `${health.tallyInstallDir}\\tally.exe`
              : "C:\\Program Files\\TallyPrime\\tally.exe"
          }
          onClose={() => setShowITPolicyModal(false)}
        />
      )}
    </div>
  );
}
