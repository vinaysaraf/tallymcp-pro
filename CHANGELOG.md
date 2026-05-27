# Changelog

All notable changes to this project will be documented in this file.

## v1.0.3 — MSIX/Store Claude Desktop detection + restart toast + Disconnect (2026-05-27)

Critical hotfix shipped same-day as v1.0.2 after a real-world remote-install via AnyDesk on a friend's Gold Tally machine surfaced that the Configurator wires Claude Desktop to the wrong path when the user installed Claude Desktop from the Microsoft Store. The Store version is AppContainer-sandboxed under `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` instead of the standard `%APPDATA%\Claude\` — v1.0.2 only wrote to the standard path, so Store-version Claude Desktop never saw TallyMCP. Same hotfix surfaces a one-click Disconnect button on every configured client tile so non-technical users can cleanly remove TallyMCP from any AI tool without editing JSON.

### Fixed
- **MSIX/Store Claude Desktop config detection** (#140 CRITICAL). New `resolveClaudeDesktopConfigPaths(env, fs)` helper in `@tallymcp/client-wirer` (6 unit tests) scans `%LOCALAPPDATA%\Packages\` for `Claude_*` entries. `ClientWirer.add()` now writes to ALL applicable Claude Desktop config paths — both standard and MSIX sandbox if both exist. `ClientWirer.remove()` strips from the same path set so disconnect cleans every flavor in one click. `detectConfiguredClients` in `handleHealthCheck` probes the same path set, so the HealthCheck tile reflects reality regardless of which Claude Desktop flavor the user has. `WireResult` / `WireResponse` extended with `configPaths: string[]` + `variants: ("standard"|"msix")[]` to carry the multi-path info through to the renderer.

### Added
- **Post-wire restart toast with MSIX caveat** (#139, #140). `DoneScreen.tsx` rewritten — for Claude Desktop, renders explicit "right-click the Claude Desktop icon in the system tray → Quit, then reopen" instructions (closing the window doesn't reload the config). When `variants` includes `"msix"`, an amber caveat card surfaces the Store-version AppContainer limitation and recommends installing the standalone version from `claude.ai/download` if the wire-up doesn't take effect. For non–Claude-Desktop clients (Cursor, Claude Code, LM Studio, Ollama), the existing generic restart copy is preserved.
- **Wire-time MSIX warning in `AddMcpModal`** (#140, Cursor plan-review rec #2). When the user clicks "+ Add MCP" on the Claude Desktop tile AND `HealthCheckResponse.claudeDesktopVariants` includes `"msix"`, the modal renders an amber warning card BEFORE the Add MCP button. Users learn about the AppContainer caveat (and the `claude.ai/download` standalone alternative) upfront — no wasted tray-quit cycle. The path-display block in the modal also shows both `%APPDATA%\Claude\…` and `%LOCALAPPDATA%\Packages\Claude_*\…` when MSIX is detected.
- **One-click Disconnect button on configured tiles** (#141). Every connected client tile (`✓ Connected`) now shows a red **Disconnect** button next to **Reconfigure**. Click → small confirm modal ("Disconnect TallyMCP from <Client>? We'll surgically remove only the `tallymcp-pro` entry — your other MCP servers, data, and <Client>'s own settings are unaffected.") → click Disconnect → tile flips back to `+ Add MCP`. Backend wiring (`ClientWirer.remove`, `handleUnwireMcp`, UNWIRE_MCP IPC, `unmarkClientConfigured` store) was already in place from v1.0.2; v1.0.3 adds the UI surface (Disconnect button on `ClientTile.tsx`, new `DisconnectConfirmModal.tsx` component, `handleDisconnect` + `handleConfirmDisconnect` in `App.tsx`).

### Changed
- `apps/configurator/package.json` version 1.0.2 → 1.0.3.
- `packages/client-wirer/src/wirer.ts` — `add()` and `remove()` iterate all resolved config paths; combined action is `added` if any path was added, `updated` if any was updated, `noop` only when all paths were already correct.
- `packages/client-wirer/src/types.ts` + `apps/configurator/src/shared/ipc-types.ts` — `WireResult` / `WireResponse` / `UnwireResult` / `UnwireResponse` extended with `configPaths` + `variants`. `configPath` (singular) retained as `=== configPaths[0]` for back-compat with v1.0.2 consumers.
- `apps/configurator/src/renderer/components/TileGrid.tsx` + `ClientTile.tsx` — added `onDisconnect` prop threaded from `App.tsx`.

### Public API note (v1.0.3 type-constructor breaking change)
- `@tallymcp/client-wirer` exported types `WireResult`, `UnwireResult` (and the corresponding configurator IPC types `WireResponse`, `UnwireResponse`) now REQUIRE the new `configPaths: string[]` field (and `variants: ClientConfigVariant[]` on the wire side). Code that READS these types is unaffected — `configPath` (singular) is still present and equal to `configPaths[0]`. Code that CONSTRUCTS these literals (e.g. test mocks of `wireMcp` / `unwireMcp`) must add the new fields. `ClientConfigVariant = "standard" | "msix"` is newly re-exported from `@tallymcp/client-wirer`.
- Manual verification recommended on real Store-Claude install: install or upgrade to v1.0.3, click **+ Add MCP** on Claude Desktop → confirm the amber MSIX warning appears in the modal → wire → DoneScreen shows tray-quit instructions + MSIX caveat card → quit Claude Desktop from system tray → verify `tallymcp-pro` entry lands in `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json`. If MCP tools still don't appear in Claude Desktop after restart, install the standalone Claude Desktop from `claude.ai/download` (documented AppContainer caveat). Users who wired the standalone first and later installed the Store version should click **Reconfigure** on the Claude Desktop tile so v1.0.3 picks up the new MSIX path.

### Notes
- The MSIX detection helper uses a generic `existsSync` + `readdirSync` probe interface so v1.0.4+ can extend it to detect other future Claude Desktop install variants without changing the wirer's API.
- Disconnect is destructive but reversible — the confirm modal mirrors the existing `RestoreConfirmModal` pattern (Cancel + red destructive action). The pre-existing `.bak` backup created at first wire is preserved through disconnect, so users could even manually restore the prior config state if needed.
- Test count: client-wirer +12 (paths helper 6 + types 2 + wirer-add MSIX 4); configurator +18 (DoneScreen variants 4 + ipc-handlers MSIX 4 + AddMcpModal MSIX 3 + ClientTile disconnect 3 + DisconnectConfirmModal 4). Total v1.0.3 adds **+30 tests** across the workspace (client-wirer 45→57, configurator 122→140).
- Cursor plan-review verdict was ⚠ NEEDS REVISION; all 3 blocking issues (tm-yellow/tm-red Tailwind, public-api.test.ts) and 6 recommendations (wire-time MSIX warning, data-testid, FakeExecRunner, code comments) folded into the plan before execution.
- Open follow-ups deferred to v1.0.4: #138 (Restart Tally modal after autofix), #134 (edition heuristic refinement), #136 (TB/P&L/BS over-gating fix), aria-describedby on modals, optional success/Already-disconnected toasts.
- v1.0.3 is a same-day hotfix; v1.0.2's defender-exclusion docs, timeout, gateway visibility, and prompt rewrites all carry through unchanged.

## v1.0.2 — Remote-install UX + connector hardening (2026-05-27)

Patch release surfacing fixes from real-world v1.0.1 install on the user's networked TallyPrime setup (Tally Gateway Server=PAKHI:9999, 11 custom TDLs, dual Claude+Cursor MCP wire). Prepares the installer for a downstream remote install via AnyDesk on a friend's Gold Tally instance.

### Fixed
- **`tally_list_companies` no longer rejects display-format dates** (#133, already shipped on `main` via PR #8). `listCompanies` now routes `STARTINGFROM` + `BOOKSFROM` through `normalizeTallyDate()` (extracted to shared `connectors/date-utils.ts`), accepting both `20240401` (canonical) and `1-Apr-2024` (display format / Silver). 3 regression tests cover the matrix.
- **NSIS installer's empty progress pane fixed** (#126). `installer/installer.nsh` gets a `!macro customHeader` block with `ShowInstDetails show` + `ShowUninstDetails show` — the only hook expanded AFTER electron-builder's `common.nsh` `nevershow`. Companion `installer/scripts/patch-installSection.mjs` (beforePack) replaces `SetDetailsPrint none` → `SetDetailsPrint both` in `node_modules/.../installSection.nsh` so the per-file extraction log actually prints. Without both, slow installs (Defender real-time scanning) feel frozen.
- **MCP server prompts rephrased to avoid Claude's prompt-injection guardrail** (#132). All 6 prompts (`config`, `read`, `export`, `audit`, `dashboard`, `help`) rewritten from imperative ("Run X first. If it succeeds, call Y...") to descriptive prose ("Tools relevant for this task: X verifies Y. A typical sequence uses these in order."). New `apps/mcp-server/test/prompts-guardrail.test.ts` asserts no prompt content matches the imperative-pattern regex. Prompt `name` / `arguments` schemas preserved — existing user configs continue to work.

### Added
- **Connector request timeout** (#128). New `TallyRequestTimeoutError` class (exported from `@tallymcp/tally-connector`). `client.post(xml, { timeoutMs })` accepts a per-call override; instance-level default via constructor; global default via new `config.tally.requestTimeoutMs` field (defaults 30000); env var `TALLYMCP_TIMEOUT` overrides everything. Replaces the previous 60s body / 30s headers undici split — single 30s total now, fail-fast instead of hanging indefinitely. `pnpm diagnose-tally` maps to a new `REQUEST_TIMEOUT` diagnostic code with the gateway-reachability hint. Critical safety net for networked Tally setups where `Ignore Tcp Timeout=Yes` in tally.ini would otherwise let Tally wait forever for an unreachable gateway.
- **HealthCheck: Tally Gateway Server info** (#129). `HealthCheckResponse.tallyGatewayServer?: string` populated from tally.ini parse (case + whitespace tolerant regex). Renders a yellow ⚠ card in the Configurator: "Tally Gateway Server: HOST:PORT — networked client mode. If gateway is unreachable, Tally may hang on heavy queries." Also adds `HealthCheckResponse.tallyEdition?: "silver" | "gold" | "unknown"` (read from `config.tally.assumedEdition` if set) with an info row above the Patch A card.
- **HealthCheck: Dual-client warning** (#131). When `configuredClients.length > 1`, renders a yellow ⚠ card: "N AI clients configured. Each runs its own MCP server. Tally's XML interface is single-threaded — use one client at a time during heavy operations." Catches the dual Claude+Cursor wire pattern that overloads Tally during audit-lite (Cursor's deep-analysis finding 2026-05-27).
- **HealthCheck: Multiple-installs warning + disabled Fix button** (#137). `multipleTallyInstalls` was already returned by `handleHealthCheck` but never rendered. Now shows a yellow ⚠ card listing all detected install paths + disables the Fix button with explanatory label ("Fix both (disabled — multiple installs)") since `handleTallyFix` throws on `>1` installs. Prevents the bad UX of a button that always fails.
- **Docs**: new `docs/v1-installer-defender-exclusion.md` — folder-scoped AV exclusion guide for 7 major antivirus products (Defender, Bitdefender, Norton, McAfee, Kaspersky, Sophos, Quick Heal) + managed-Windows IT-approval section + diagnostic PowerShell snippet. Cancel-button-during-install note added to `docs/v1-installer-phase4-manual-smoke.md` (Known Phase 4 limitations).
- **Tests**: configurator 114 → 122 (+8 for the 3 HealthCheck additions). tally-connector 23 → 26 (+3 for timeout). mcp-server 14 → 16 (+2 for prompt guardrail). report-engine 44 → 47 (+3 for #133 date format, already on main). Total v1.0.2 adds +16 tests across 4 packages.

### Changed
- `apps/configurator/package.json` version 1.0.1 → 1.0.2.
- Root `package.json` `package` script: inserts `node installer/scripts/patch-installSection.mjs` before the electron-builder invocation.

### Notes
- Per the v1.0.2 plan (`ai-review/v1.0.2-plan-for-remote-gold-install.md`), the following are deferred to v1.0.3+: edition heuristic refinement (#134), Silver over-gating fix for TB/P&L/BS (#136), audit-lite sequential + progress streaming (#130), TDL `$$Walk:Voucher` workaround for Silver users (#135).
- v1.0.2 was reviewed by Cursor on `ai-review/v1.0.2-plan-for-remote-gold-install.md` with verdict ✅ APPROVED TO EXECUTE.

## v1.0.0-phase4 — Release pipeline + auto-update (2026-05-26)

### Added
- **`.github/workflows/release.yml`** — tag-triggered (`v*.*.*`) release pipeline on `windows-latest`. Runs the full local gate (build/lint/test/typecheck/e2e), decodes `CSC_LINK_BASE64` to a temp `.pfx`, signs the `.exe` via electron-builder + signtool, generates `latest.json`, and uploads the 4 artifacts (`.exe`, `.sha256`, `latest.yml`, `latest.json`) to the GitHub Release via `softprops/action-gh-release@v2`.
- **Real `electron-updater` integration** in `apps/configurator/src/main/auto-update.ts` (replaces Phase 2's `checkForUpdatesStub`). Wraps the `autoUpdater` singleton with a typed state-machine factory `createAutoUpdater`. State machine: `up-to-date` → `update-available` → `downloading` → `ready-to-install` (sticky `error` on any failure). `autoDownload = false` + `autoInstallOnAppQuit = false` enforce explicit user-clicks-Update consent. **Cursor C1 split**: `downloadUpdate` returns immediately + progress streams via the subscriber; `quitAndInstall` is a separate IPC the renderer invokes only when the banner is in `ready-to-install`. **Cursor H1**: `downloadUpdate` captures rejection into the error state instead of throwing.
- **`UpdateBanner` React component** — calm blue banner above StatusBanner + ErrorBanner. Renders one of four shapes per `UpdateStatus.status`: available → progress bar → restart → null. Includes "What's new" link to the release notes URL.
- **IPC schema**: `UpdateStatus` discriminated union, `UPDATE_STATUS_EVENT`, 3 new `IPC_CHANNELS` (`CHECK_FOR_UPDATES`, `DOWNLOAD_UPDATE`, `QUIT_AND_INSTALL`), 4 new `TallymcpApi` methods (`checkForUpdates`, `downloadUpdate`, `quitAndInstall`, `subscribeUpdateStatus`).
- **Zustand `updateStatus` slice** + `updateDismissedThisSession` flag + `setUpdateStatus` + `dismissUpdate` actions.
- **`installer/scripts/generate-latest-json.mjs`** — pure-function-cored Node script generating the spec Appendix C `latest.json` from version + sha256 + tag/repo env vars. **Cursor H2 guard**: rejects tag/version mismatch (`tag !== "v" + version`) so an out-of-sync tag-push can't produce a `latest.json` pointing at a non-existent artifact.
- **+23 net new configurator unit tests** (2 IPC type + 4 preload + 9 auto-update + 5 UpdateBanner + 2 store + 1 App integration). Configurator: 91 → 114. Plus 3 generate-latest-json tests outside the workspace.
- **Three new docs**: `docs/v1-installer-phase4-release-procedure.md`, `docs/v1-installer-phase4-secrets-setup.md`, `docs/v1-installer-phase4-troubleshooting.md`.

### Changed
- `apps/configurator/electron-builder.yml` — `publish: null` → `publish: { provider: github, owner: vinaysaraf, repo: tallymcp-pro, releaseType: release }` so electron-builder generates `latest.yml` and the release workflow can upload artifacts via `--publish always`.
- `apps/configurator/src/main/index.ts` — IPC registration is split (Cursor H3 + E2E regression fix `d2ad21a`): the 6 core channels register via `registerIpcHandlers(...)` BEFORE `await createWindow()` so the renderer's mount-effect `healthCheck` + `getConfig` IPC calls find handlers waiting; the 3 update channels (`check-for-updates`, `download-update`, `quit-and-install`) register inline AFTER the `createAutoUpdater(...)` bootstrap succeeds. The auto-updater bootstrap itself is wrapped in `try/catch` so dev / Playwright E2E (unpackaged Electron, where `electron-updater` may not initialize) still gets the core app — only the update banner is missing.
- `apps/configurator/src/main/ipc-handlers.ts` — `RegisterContext` is back to `{ installDir, version }`; the optional `autoUpdater?` field has been removed since the 3 update channels are now registered inline in `main/index.ts`.

### Notes
- The user manually opens the GitHub Release page to edit notes (Step 8 of the release procedure). The "What's new" link in the banner already points at the release page.
- No silent background install: `autoDownload` + `autoInstallOnAppQuit` are both false. User explicitly clicks "Update now" then "Restart now" (spec §10).
- SHA-256 verification is delegated to `electron-updater` (signed by electron-builder via signtool transparently).

## v1.0.0-phase3.1 — Admin/elevation UX hotfix (2026-05-26)

### Added
- **`detectIsElevated(runner): Promise<boolean>`** in `@tallymcp/tally-autofix` — runs `net session 2>nul` and returns true on exit 0. Used by the Configurator's HealthCheck to render an admin-needed hint when applicable.
- **`TallyIniLockedError`** error class in `@tallymcp/tally-autofix`. Thrown by `fixXmlInterface` when the underlying write fails with `EPERM`/`EACCES`. Carries a CA-friendly message ("Couldn't edit tally.ini at <path>. This usually means TallyPrime is currently running...") that replaces the raw OS error in the renderer's ErrorBanner.
- **`GroupPolicyError`** error class + `firewallRule: "group-policy-blocked"` outcome in `TallyAutofixer.ensureFirewallRule`. The library used to throw a generic `Error` with a "Group Policy" message; now it throws the typed class and the `TallyAutofixer` wrapper catches it into a discriminated outcome the IPC contract exposes.
- **`HealthCheckResponse.isElevated?: boolean`** — optional field populated by `handleHealthCheck` via `detectIsElevated`. Drives the Fix button's "(Admin needed)" label + a small "Right-click → Run as administrator" hint.
- **`ITPolicyHelpModal` React component** — opens when `handleFixAll` sees `firewallRule === "group-policy-blocked"`. Shows the exact `netsh` command IT can run, the equivalent `New-NetFirewallRule` PowerShell, and a "skip if loopback-only" reassurance with the technical reason.
- **Zustand `firewallSkipReason` slice** — `"non-admin" | "group-policy" | undefined`. Set by `handleFixAll` based on the `tallyFix` response. Auto-cleared on screen navigation (extends Phase 2's `navigateTo` `lastError` clear).
- **HealthCheck Patch A yellow card** — renders below the status list when `firewallSkipReason === "non-admin"`. Explains that the XML interface change DID apply, that AI tools on this same PC still work over loopback, and that the firewall rule is only needed for multi-machine setups.
- **HealthCheck Patch C admin pre-flight** — when `status.isElevated === false` and a fix is needed, the Fix button reads "Fix both (Admin needed) →" and a hint above it suggests "Right-click TallyMCP → Run as administrator, OR follow the manual steps after clicking Fix."
- **+14 net new configurator unit tests** (2 handleHealthCheck.isElevated + 2 store + 3 HealthCheck Patch A — incl. Cursor H1 Re-check gate — + 2 HealthCheck Patch C + 3 ITPolicyHelpModal + 2 App-level) plus **+8 in `@tallymcp/tally-autofix`** (4 elevation including the defensive exit-code test added during code review + 2 TallyIniLockedError + 2 GroupPolicyError/group-policy-blocked). Configurator count: **76 → 90**. `@tallymcp/tally-autofix` count: **44 → 52**. All Phase 1 + Phase 2 + v0.7 tests unchanged + green.

### Changed
- `TallyAutofixer.ensureFirewallRule` return type widened from `"added" | "noop" | "skipped-non-admin"` to add `"group-policy-blocked"`. Backwards-compatible for callers that exhaustively switch on the union (they'll get a TypeScript hint about the new variant).
- `TallyFixResponse.firewallRule` IPC field widened identically.
- `@tallymcp/cli` `TallyFixResult.firewallRule` widened to match (Task 4 code-review follow-up) and `apps/cli/src/main.ts` gained an explicit `else if (result.firewallRule === "group-policy-blocked")` branch with IT-policy guidance — previously the CLI silently printed `✓ Firewall rule: group-policy-blocked` (wrong; IT-policy block is a warning, not success).

### Notes
- No new IPC channels — `HealthCheckResponse.isElevated` is the only new field, and `TallyFixResponse.firewallRule` adds a new variant. Both backwards-compatible.
- No auto-elevation (UAC prompt). The NSIS installer is user-mode per Phase 3 (no elevation manifest); the user manually re-launches as admin when needed. Acceptable v1.0 trade-off.
- The 4 patches were prompted by a real screenshot of a Windows Firewall "Allow" button grayed by org policy on a managed Windows install (different project, but the same UX trap applies to TallyMCP's firewall + tally.ini admin touchpoints).

## v1.0.0-phase3 — NSIS Installer + uninstall hooks + signing (2026-05-26)

### Added
- **`installer/`** new directory with `installer.nsh` (custom NSIS macros — `customUnInstall` invokes the Configurator's no-UI cleanup), `scripts/` (Node helpers: `fetch-node.mjs` downloads pinned Node 20.18.1 portable runtime, `deploy-mcp-server.mjs` runs `pnpm deploy --prod` to stage the MCP server with flat node_modules, `checksum.mjs` writes a `.sha256` sidecar), and `test/` (Windows PowerShell smoke scripts for headless install/uninstall round-trip).
- **`apps/configurator/electron-builder.yml`** — NSIS config: user-mode install (no admin), default install dir `%LOCALAPPDATA%\Programs\TallyMCP\`, `extraFiles` for bundled `node.exe` + staged `mcp-server/`, custom NSH include for the uninstall hook.
- **`apps/configurator/src/main/uninstall-cleanup.ts`** + `--uninstall-cleanup` argv mode in `main/index.ts` — runs the no-UI cleanup before NSIS wipes the install dir: unwires all 5 AI client configs, restores `tally.ini` from `.tallymcp-bak`, removes the Windows Firewall rule (when admin). Wrapped in `app.whenReady().then(...).catch(...)` with `app.exit(0/1)` so NSIS `ExecWait` gets a deterministic exit.
- **`apps/configurator/src/main/install-dir.ts`** — pure `resolveInstallDir()` helper used by `main/index.ts`. In packaged builds it derives the dir from `dirname(app.getPath("exe"))`; in dev it falls back to `%LOCALAPPDATA%\Programs\TallyMCP` (matches electron-builder's user-mode default so wire snippets generated in dev continue to work post-install).
- **Root `pnpm package` script** — orchestrates `pnpm -r build` → `fetch-node` → `deploy-mcp-server` → `electron-builder --win` → `checksum`. Output: `apps/configurator/dist-installer/TallyMCP-Setup-v<version>.exe` + `.sha256`. Plus `pnpm package:install` + `pnpm package:uninstall` for the local smoke scripts.
- **Self-signed code signing** via `electron-builder`'s standard `CSC_LINK` + `CSC_KEY_PASSWORD` env vars. Absent those, the build still produces an unsigned `.exe` with a console warning (useful for engineers without the cert). Setup guide: `docs/v1-installer-phase3-signing-setup.md`.
- **76 unit tests** (existing 69 + 3 new `install-dir.ts` + 4 new `uninstall-cleanup.ts`) + the existing 4 Playwright E2E tests, all green.

### Changed
- `handleWireMcp` args path now points at `<installDir>\mcp-server\dist\main.js` (was `<installDir>\mcp-server\main.js`). This matches `pnpm deploy --prod` output layout — the deploy preserves `dist/main.js`. Existing wired AI clients from earlier dev builds remain functional via the Configurator's H10 hydration → Reconfigure path (just re-Add MCP to refresh).
- Phase 2's `installDir` resolution moved from inline computation to the new `resolveInstallDir()` helper. Production install dir is now `%LOCALAPPDATA%\Programs\TallyMCP\` (was `%LOCALAPPDATA%\TallyMCP\`) — aligns with electron-builder's user-mode default + the `Programs\` convention used by VSCode and other user-mode Electron installers.

### Notes
- Phase 3 ships only the LOCAL installer build. GitHub Actions release pipeline (`release.yml` triggered by `v*.*.*` tag push, signs on `windows-latest`, uploads to GitHub Release, publishes `latest.json`) lands in Phase 4.
- The Phase 2 `auto-update.ts` stub stays untouched; Phase 4 will swap it for real `electron-updater` against the hosted `latest.json`.
- Real installer/app icons are intentionally deferred — Phase 3 uses electron-builder's default Electron logo as a placeholder. Pre-release polish item.
- No EV cert — SmartScreen will still show "Unknown publisher" on first run. Phase 2's `SmartScreenGuide` popup walks users through "More info → Run anyway".

## v1.0.0-phase2 — Configurator UI (Electron) (2026-05-26)

### Added
- **`@tallymcp/configurator`** Electron app — the user-facing UI on top of the Phase 1 libraries. Six screens + one confirmation modal (Home tile grid · Add MCP modal · Health Check · SmartScreen guide · Settings · Done screen · Restore confirmation modal) wired via a typed IPC contract.
- Electron main process owns all Node.js access (`@tallymcp/client-wirer`, `@tallymcp/tally-autofix`); renderer talks to main exclusively through `contextBridge`-exposed `window.tallymcp` API with `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`.
- Background Tally HTTP poller pushes live status to the renderer via `tally-status` IPC events (5 s interval, loopback-only).
- `electron-updater` scaffolded with a stubbed update source — real `latest.json` integration in Phase 4.
- 69 unit tests (main IPC handlers + Zustand store + React components, including `configuredClients` probing, `multipleTallyInstalls` detection, `RestoreConfirmModal`, `DoneScreen`, `ErrorBanner`, App-level error surfacing) + 4 Playwright E2E tests (Electron driver launches the built app, exercises all screens).

### Security
- `wireMcp` IPC handler no longer trusts a renderer-supplied `installDir`. Main resolves the canonical `%LOCALAPPDATA%\TallyMCP` at boot and injects it via `WireMcpContext` when registering the handler. A renderer (or DevTools) caller can no longer point the wire entry at an arbitrary folder. (Cursor review H1, addressed in `f808be9`.)

### Error handling
- All Tally IPC calls (`wireMcp`, `tallyFix`, `tallyRestore`, `healthCheck`) are now wrapped in try/catch in `App.tsx`. Failures surface via a dismissible red `ErrorBanner` rendered between the `StatusBanner` and the active screen. Errors auto-clear on screen navigation and on the next successful operation. (Cursor review M1 + M3.)

### Notes
- Phase 2 ships the UI but NOT the installer packaging (Phase 3), code signing (Phase 3), or the GitHub Actions release pipeline (Phase 4).
- The renderer never persists state to disk — Zustand is in-memory; the canonical config lives in `%LOCALAPPDATA%\TallyMCP\config.json` (managed by the MCP server) and is exposed read-only via `getConfig` IPC.
- Renderer makes exactly one outbound HTTP call: the Tally poll to `http://127.0.0.1:9000` (loopback). No analytics, no auto-update fetch in Phase 2 (Phase 4 wires that).
- Bumped `electron-vite` from `2.x` → `4.x` (resolves the `splitVendorChunk` API removal in Vite 5+); preload bundle pinned to CJS output so the main process's hardcoded `../preload/index.js` path keeps working.

## v1.0.0-phase1 — Installer foundation (2026-05-25)

### Added
- **`@tallymcp/client-wirer`** package — atomic JSON merge / backup / remove for the 5 supported AI clients (Claude Desktop, Cursor, Claude Code, LM Studio, Ollama).
- **`@tallymcp/tally-autofix`** package — `tally.ini` parser/editor that preserves order and comments, Windows Firewall rule manager via `netsh`, Tally process detection.
- **`@tallymcp/cli`** app exposing 4 commands:
  - `tallymcp-cli wire <client>` — adds TallyMCP to the named AI client's config.
  - `tallymcp-cli unwire <client>` — surgically removes our entry.
  - `tallymcp-cli tally-fix` — turns on Tally's XML interface and adds the firewall rule.
  - `tallymcp-cli tally-restore` — restores `tally.ini` from backup and removes the firewall rule.
- `claude-code` added to `apps/mcp-server/src/client-config.ts` SupportedClient list so the runtime config-export tool stays in sync with the installer.

### Notes
- Phase 1 ships only the data-layer libraries and a terminal CLI. The Electron Configurator UI lands in Phase 2.
- JSON config files written by `client-wirer` are formatted with `JSON.stringify(merged, null, 2)`; whitespace and key order may differ from the original. The `.bak` siblings preserve the pre-edit file byte-for-byte for restore.

### Preview-and-confirm UX for CLI commands (Phase 1 addendum)

All 4 CLI commands now print an explicit preview of every file change they will make before modifying anything on disk.  The user must type `y` or `yes` to proceed; any other input (including empty) aborts with exit code 1.

**`-y` / `--yes` flag** — skips the interactive prompt entirely. Intended for scripted environments and for the Phase 2 Configurator UI (which has its own visual consent surface and will pass `--yes` when invoking the CLI).

Behavior summary per command:

| Command | Preview shows | Reversible with |
|---|---|---|
| `wire <client>` | config file path + JSON entry that will be added + backup path | `unwire <client>` |
| `unwire <client>` | config file path + key that will be removed | — |
| `tally-fix` | `tally.ini` path + 2 lines that will be added + firewall rule details | `tally-restore` |
| `tally-restore` | `tally.ini` + backup path that will be restored + firewall rule that will be deleted | — |

The abort path throws an `AbortError` (exported from `apps/cli/src/confirm.ts`); `main.ts` catches it, logs `"Aborted."`, and exits with code 1.  Tests inject a `confirmFn` stub rather than reading from stdin.

### Changed (post-smoke fixes)
- `tally-fix` now skips the Windows Firewall step gracefully when not run as
  Administrator, instead of failing. The `tally.ini` edit still proceeds.
  Most CAs run TallyMCP entirely on loopback (`127.0.0.1:9000`), which does
  not require the firewall rule. Power users with multi-machine setups can
  re-run from an elevated terminal to add it.
- `tally-restore` likewise skips firewall removal gracefully when not run as
  Administrator — `tally.ini` is still restored. The CLI surfaces a clear
  warning with instructions rather than crashing with a stack trace.
- `client-wirer` strips UTF-8 BOM before `JSON.parse` (PowerShell-generated
  config files frequently have one).

## [Unreleased]

### Added

- **v0.7.0 — TDL engine kill-switch:**
  - New `@tallymcp/tdl-engine` package: nunjucks renderer + angular-bracket parameter substitution + F01..Fn row parser + `runTdlReport` orchestrator. Templates are data (`packages/tdl-engine/templates/*.xml` + `report-catalog.json`). 32 Vitest tests.
  - `TallyHttpClient` switched to **UTF-16 LE transport** by default, with per-call `charset?: "utf-16" | "utf-8"` override so legacy UTF-8 envelopes keep working during the migration.
  - `trial-balance.xml` shipped as the first inline-TDL template: `REPORT + FORM + PART + LINE + FIELDs + COLLECTION` over `<TYPE>Ledger</TYPE>` projecting Name / Parent / Opening / Debit / Credit / Closing as F01..F06.
  - `getTrialBalance` connector rewired to delegate through `tdl-engine` while preserving its `TrialBalanceRow[]` return contract. Existing legacy connectors (P&L, BS, masters, day-book, sales, ledger-balance) explicitly request `charset: "utf-8"` until they migrate to TDL in v0.7.1+.
  - C-R1 enforcement: CI test (`packages/tdl-engine/test/c-r1-grep.test.ts`) refuses any template containing Import / Alter / Create / Delete / `MASTER ID` directives.
  - Live proof script: `pnpm v070-tb-proof`. Results captured in `docs/live-tally-checklist.md`.
  - 256 tests passing across all 10 packages.

- **S3 + S4** — `@tallymcp/mcp-server`: stdio MCP server exposing 15 tools (connection, companies, 10 reports, masters/vouchers/dashboard/audit-lite exports, config), 6 prompts (`config`/`read`/`export`/`audit`/`dashboard`/`help`), and 3 resources (`tally://companies`, `tally://docs/connection-guide`, `tally://audit/last`). Network guard restricts egress to the configured Tally host:port (C-R3). Snippet generator emits MCP client config for Claude Desktop, Cursor, LM Studio, and Ollama. 14 Vitest tests including in-process client/server integration.
- **S4 analytics-engine** — `@tallymcp/analytics-engine`: 18 audit-lite check functions (ledger hygiene, GST/PAN format, voucher narrations, duplicate numbers, round-figure / large-journal / backdated, cash negative, suspense balance), `runAuditLite` orchestrator, explainable `computeBooksScore` (0–100), `toAuditWorkbook` Excel renderer, and 3 dashboard builders (ManagementSnapshot, SalesTrend, ExceptionsOverview); 8 Vitest tests including full-sweep and clean-fixture sanity.
- `@tallymcp/shared-types`: `BooksScore`, `BooksScoreComponent`, `AuditLiteSummary`, `AuditLiteResult` schemas
- **S2.2** — `@tallymcp/output-store`: new package wiring `report-engine` + `excel-engine`. `exportReport` (xlsx or json), `exportMasters` (multi-sheet xlsx + per-master CSVs), `exportVouchers` (streaming CSV via new `getDayBookStream`, UTF-8 BOM, RFC-4180 quoting). `GeneratedFile` metadata; safe filename/dir helpers; 8 Vitest tests
- **S2.1** — `@tallymcp/excel-engine`: declarative `WorkbookSpec`/`SheetSpec`/`ColumnSpec` (Zod); `renderWorkbook` via ExcelJS producing `.xlsx` Buffers; Indian currency format presets (`#,##,##0.00`); cover sheet, extraction log, freeze panes, auto-filter; per-report `toWorkbookSpec` adapter covering all 10 in-scope reports; 24 Vitest tests including round-trip per report
- `@tallymcp/shared-types`: `GeneratedFile` + Zod schema. `@tallymcp/report-engine`: `getDayBookStream` async iterable for memory-safe voucher export
- **S1.4** — `@tallymcp/config-store`: `ConfigSchema` (TallyConnection, FinancialYear, `security.readOnly` defaults true per C-R2, `output.folder`, `defaultCompany`, `defaultFinancialYear`); `ConfigStore` with on-disk JSON + Zod validation, in-memory cache, deep-merge `update()`, and `schemaVersion` migration stub; 17 Vitest tests
- **S1.3** — `@tallymcp/report-engine`: 10 report connectors (companies, company-info, ledgers, groups, voucher-types, day-book, trial-balance, P&L, balance-sheet, sales-register); `resolvePeriod` (Indian FY defaulting from `Company.startingFrom`); 7-day chunked Day Book reader; `runReport` dispatcher (Zod-validated request, typed `ReadReportResult`); `TallyReportError` for soft `<LINEERROR>` responses; 48 Vitest tests, **89.8 %** package coverage; `scripts/read-report.ts` live-test CLI
- **`@tallymcp/shared-types`** extensions: `VoucherLine`, `Voucher` (with `party`/`reference`/`entries`), `TrialBalanceRow`, `PnlRow`, `BalanceSheetRow`, `ReportId` enum, `ReadReportRequest`, `ReadReportResult`, `ReportStatus`, `ReportMeta`, `Finding`, `FindingSeverity`; 22 new Vitest tests
- **S1.2** — `@tallymcp/tally-xml` XML response parser: `parseTallyResponse` (fast-xml-parser, UTF-8/entity-safe, no-prolog tolerant), `walk`/`findAll` tree helpers, `extractLineErrors`, `parseTallyAmount` (Indian lakh grouping + Cr/Dr), `parseTallyBoolean`; `TallyXmlError`/`TallyAmountParseError`; 45 Vitest tests; `@vitest/coverage-v8` added for the coverage gate
- **S1.1** — `@tallymcp/tally-xml` Export Data envelope builder: `buildExportEnvelope` + 10 per-report envelope helpers (List of Companies, Company Info, Ledgers, Groups, Voucher Types, Day Book, Trial Balance, P&L, Balance Sheet, Sales Register); UTF-8 export vars and XML escaping on every envelope; 17 Vitest tests

### Changed

- Repository scoped to source code and developer docs; internal business-requirements and implementation-plan documents are maintained privately.

## [0.0.1] — 2026-05-21

### Added

- Phase 0 monorepo bootstrap (pnpm workspace, TypeScript strict, ESLint, Prettier, Vitest, CI)
- `@tallymcp/shared-types` — core Zod domain schemas
- `@tallymcp/tally-xml` — XML escape/date helpers with tests
- `@tallymcp/tally-connector` — Tally HTTP client, request serializer, diagnostics
- Tally XML sample fixtures and `scripts/hello-tally.ts`
