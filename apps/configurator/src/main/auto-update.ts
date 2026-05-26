/**
 * Phase 2 stub for the update-check flow. Real implementation lands in
 * Phase 4 when we have a release pipeline + latest.json source. For now
 * the Configurator's "Check for updates" button always reports up-to-date.
 *
 * When Phase 4 lands, replace `checkForUpdatesStub` with `autoUpdater`
 * (from `electron-updater`) wired to the GitHub Releases URL.
 */

export interface UpdateCheckResult {
  status: "up-to-date" | "update-available" | "error";
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

export async function checkForUpdatesStub(): Promise<UpdateCheckResult> {
  return {
    status: "up-to-date",
    currentVersion: process.env.npm_package_version ?? "0.0.1",
  };
}
