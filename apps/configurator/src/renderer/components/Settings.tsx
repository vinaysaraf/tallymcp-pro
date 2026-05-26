import type { ConfigSnapshot } from "../../shared/ipc-types.js";

export interface SettingsProps {
  config: ConfigSnapshot;
  onRestoreTallySettings: () => void;
  onReCheck: () => void;
}

export function Settings({
  config,
  onRestoreTallySettings,
  onReCheck,
}: SettingsProps): JSX.Element {
  return (
    <div className="bg-tm-card border border-tm-border rounded-lg p-5 text-sm text-tm-text">
      <div className="font-bold text-tm-blue-deep mb-4">Settings</div>

      <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
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
