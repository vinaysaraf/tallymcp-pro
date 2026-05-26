# Cursor review — Phase 4 plan (release pipeline + auto-update)

**Date:** 2026-05-26  
**Branch:** (not yet created — plan-only review)  
**Plan:** `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md` (~1,800 lines, 13 tasks)  
**Spec:** `docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md` v1.0.3 (§9, §10, §11.2, §12, Appendix C)  
**Prerequisite:** Phase 3 merged; `electron-updater ^6.3.9` present in `apps/configurator/package.json` L19 ✓

---

## Findings

### Critical

**C1 — Update flow contradicts itself: Task 3 auto-restarts; Tasks 6/12 expect a “Restart now” step**  
Task 3 `downloadAndInstallUpdate` downloads **and** calls `quitAndInstall()` in one IPC handler:

```707:716:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
    downloadAndInstallUpdate: async () => {
      const downloadFinished = new Promise<void>((resolve) => {
        downloadResolver = resolve;
      });
      await autoUpdater.downloadUpdate();
      await downloadFinished;
      autoUpdater.quitAndInstall();
    },
```

Tasks 6 + 12 + CHANGELOG describe two-step UX: “Update now” → progress → **“Restart to apply”** → user clicks Restart (`handleRestartClick` L1389–1392; manual smoke §7–8 L2309–2317; Notes L2213). `handleRestartClick` re-invokes `downloadAndInstallUpdate()` (L1389–1392), which always calls `downloadUpdate()` first — wrong when already `ready-to-install`.

**Fix before execution:** Split responsibilities — e.g. `downloadUpdate()` IPC ends at `ready-to-install`; add `applyUpdate()` / `quitAndInstall()` IPC for Restart. Align Task 3 tests, Task 6 handlers, and Task 12 smoke.

### High

**H1 — `downloadAndInstallUpdate` can hang if `downloadUpdate()` rejects without emitting `error`**  
`downloadResolver` is cleared on `error` event (L682–692), but `await autoUpdater.downloadUpdate()` (L713) can throw/reject **before** the listener runs — `await downloadFinished` never completes. **Fix:** `try/catch/finally` around `downloadUpdate()`; reject or resolve `downloadFinished` on all paths.

**H2 — `generateLatestJson` download URL can disagree with the built artifact name**  
```1630:1630:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
    downloadUrl: `https://github.com/${owner}/${repo}/releases/download/${tag}/TallyMCP-Setup-${tag}.exe`,
```
electron-builder uses `artifactName: TallyMCP-Setup-v${version}.${ext}` (Task 8 / Phase 3 yml). If `tag` is `v1.0.0` but `package.json` `version` is still `0.0.1`, URL points at `TallyMCP-Setup-v1.0.0.exe` while the built file is `TallyMCP-Setup-v0.0.1.exe`. Release procedure bumps version (Task 10) — add an explicit gate: **tag must match `v${version}`** or derive filename from `version` only.

**H3 — Task 4 risks duplicate `registerIpcHandlers`**  
Step 2 (L800–837) adds updater wiring while Step 3’s “before” snippet (L845–849) still shows an early `registerIpcHandlers` **without** `autoUpdater`. Final shape (L889–894) is correct, but subagents may leave **two** registrations. **Fix:** Step 3 must explicitly **delete** the early call, not only show the final block.

### Medium

**M1 — Spec §10 says “GET latest.json”; plan uses `latest.yml` for in-app updates**  
Architecture (plan L7–8) is coherent: electron-updater + `latest.yml`; `latest.json` for landing/Phase 4 upload (Task 7/9). Document as intentional split in plan deferred section (like Phase 3 path drift). SHA-256 in-app: electron-updater verifies via `latest.yml` digests (typically sha512); human/landing verification uses `.exe.sha256` sidecar — defensible, not literal §10 JSON fetch.

**M2 — Spec §11.2 headless install/uninstall not in `release.yml`**  
Workflow runs unit + E2E (Task 9 L1816–1820) but not Phase 3 `install-smoke.ps1` / `uninstall-smoke.ps1`. Acceptable Phase 4 scope (manual smoke Task 12); call out §11.2 CI gap for Phase 4.1.

**M3 — `minSupportedFromVersion` emitted but not enforced in app**  
Task 7 + Appendix C field; plan deferred block L91–92 (renderer reads `latest.yml`, not `latest.json`). Defensible for v1.0 if always `minSupportedFromVersion === version`; note for future breaking releases.

**M4 — IPC types test still asserts “6 channels” (Task 1)**  
Plan adds 2 channels but does not update the existing test title/body (`ipc-types.test.ts` currently L12–18). Add assertions for `CHECK_FOR_UPDATES` / `DOWNLOAD_AND_INSTALL_UPDATE` or rename test to “8 channels”.

**M5 — `release.yml` fails on missing `CSC_LINK_BASE64` but not missing `CSC_KEY_PASSWORD`**  
Decode step errors on empty base64 (L1830–1832) ✓. Empty password → unsigned build + upload (Phase 3 warns). Consider `::error::` if `CSC_KEY_PASSWORD` unset on tag releases.

### Nit

**N1 — Auto-update state machine names are consistent** across Task 1 `UpdateStatus`, Task 3 events, Task 5 `UpdateBanner`, Task 6 store (`setUpdateStatus` / `dismissUpdate`), preload (`subscribeUpdateStatus`). Five statuses; `error` hidden in banner (Task 5 L1101) — errors via `ErrorBanner` on user actions only.

**N2 — Symbol alignment** — `UPDATE_STATUS_EVENT`, `IPC_CHANNELS.CHECK_FOR_UPDATES` / `DOWNLOAD_AND_INSTALL_UPDATE`, `AutoUpdater` factory (`getStatus` / `subscribe` / `checkForUpdates` / `downloadAndInstallUpdate`) match end-to-end.

**N3 — Execution order 1→13** — No Phase-2-style inversion: 1→2→3→4→5→6 chain; 7–8 parallel; 9 consumes 7+8; 10–13 docs/gate. Task 6 imports Task 5 `UpdateBanner` ✓.

**N4 — Placeholders / TDD** — No `TBD` / `TODO` / “implement later” / “similar to Task N” in plan body. Tasks include full code blocks and red→green steps.

**N5 — Test math** — 76 + 2 + 3 + 7 (net auto-update) + 5 + 2 + 1 = **96** configurator; +2 installer-script tests (Task 7/13) — matches plan DoD L33–34.

**N6 — `release.yml` security (good)** — `permissions: contents: write` only (L1783–1784); checkout pinned to tag ref (L1801–1804); PFX to `RUNNER_TEMP` + `GITHUB_ENV` path only (L1834–1840); `softprops/action-gh-release@v2` with `fail_on_unmatched_files` (L1864); no secret echo. `windows-latest` matches spec §9.

**N7 — Phase 2/3 prerequisites** — `electron-updater` dep ✓; CSC env vars documented (plan L76–82, Task 10b); `pnpm package` chain reused ✓.

**N8 — `UpdateBanner` `error` state** — Renders `null` (L1101); `autoUpdater` `error` events update store but may not surface until user acts — acceptable if initial-check failures stay quiet.

---

## Spec coverage (Phase 4 slice)

| Spec | Plan mapping | Gap |
|------|----------------|-----|
| **§9** trigger/build/package/sign/publish | Task 9 `release.yml` + Task 8 publish + `pnpm package` | ✓ |
| **§10** electron-updater, consent, banner | Tasks 3–6 | **C1** breaks “Restart to apply” UX |
| **§10** SHA-256 verify | electron-updater + `.sha256` sidecar (procedure §6) | Via yml hash, not JSON |
| **§10** MCP piggyback | Deferred L89 + CHANGELOG L2214 | ✓ (same install dir) |
| **Appendix C** `latest.json` | Task 7 + upload Task 9 | ✓ |
| **Appendix C** `minSupportedFromVersion` guard | Emitted Task 7; enforcement deferred L91 | v1.0 OK |
| **§11.2** integration | Phase 3 smoke local only | Not in CI |
| **§12** full DoD | Partial (landing, etc. later phases) | Expected |

---

## Verdict

**❌ NOT READY TO EXECUTE** — **C1** (download vs restart split) must be reconciled across Tasks 3, 6, and 12 before subagents start. After that: patch **H1–H3**, then **🟡 READY** (M-items are follow-ups/docs).

---

## Round 1 resolutions (applied inline to plan, pre-execution)

| # | Severity | Resolution |
|---|---|---|
| **C1** | Critical | **Fixed across Tasks 1, 2, 3, 4, 6, 11, plan header.** Split `downloadAndInstallUpdate` into two separate IPCs + `TallymcpApi` methods: `downloadUpdate` (kicks off download, returns immediately, state transitions via `subscribeUpdateStatus`) and `quitAndInstall` (separate user-consent step invoked by the banner's "Restart now" only when status is `ready-to-install`). The `AutoUpdater` factory's `quitAndInstall` method has a state-machine guard (no-op unless `ready-to-install`) so a buggy renderer or replay can't quit prematurely. Channel names: `DOWNLOAD_UPDATE` + `QUIT_AND_INSTALL`. Task 6's `handleUpdateClick` calls `downloadUpdate`; `handleRestartClick` calls `quitAndInstall`. |
| **H1** | High | **Dissolved into C1.** The `downloadFinished` Promise dance is gone entirely — `downloadUpdate` no longer waits for `update-downloaded`. Added try/catch around `autoUpdater.downloadUpdate()` that captures rejection into the `error` state instead of propagating (renderer sees the error via `subscribeUpdateStatus` instead of an IPC rejection). New test "downloadUpdate() captures rejection into the error state instead of throwing" enforces it. |
| **H2** | High | **Fixed in Task 7.** `generateLatestJson` now derives `artifactName` from `version` (matches electron-builder's `artifactName` template). Added an explicit guard: throws if `tag !== \`v${version}\``. New test "throws when tag doesn't equal v${version}" enforces it. The release procedure (Task 10a) bumps version BEFORE tagging, so this catches the case where that step was skipped. |
| **H3** | High | **Fixed in Task 4 Step 3.** Added explicit "(a) DELETE the existing `registerIpcHandlers(...)` call from its current position — it is currently right after `const installDir = resolveInstallDir(...)`" instruction with the explanation that two registrations would silently clobber the AutoUpdater handlers. Step 3 is now prescriptive ("delete then replace"), not just declarative ("show final shape"). |
| **M1** | Medium | **No action — confirmation.** `latest.json` (landing/diagnostic) vs `latest.yml` (electron-updater) split is intentional and documented in the plan's deferred section. Cursor classified as defensible. |
| **M2** | Medium | **No action — confirmation.** §11.2 headless install/uninstall CI is deferred to Phase 4.1; manual smoke (Task 12) covers it for the Phase 4 ship. |
| **M3** | Medium | **No action — confirmation.** `minSupportedFromVersion` field is emitted (Task 7); renderer-side enforcement is in the plan's Deferred list. Defensible for v1.0 since field always equals current version. |
| **M4** | Medium | **Fixed in Task 1.** The existing "exports the 6 required channel names" test now needs 3 additional channel assertions + the test title is renamed to "exports the 9 required channel names". |
| **M5** | Medium | **Fixed in Task 9.** Workflow's Decode-signing-cert step now `::error::`s on missing `CSC_KEY_PASSWORD` (parity with `CSC_LINK_BASE64`). Tag releases now fail loudly instead of producing an unsigned "Unknown publisher" .exe. |
| **N1–N8** | Nit | **No action — all confirmations.** Symbol consistency ✓, execution order ✓, placeholders ✓, prerequisites ✓, security ✓. |

Test count updates after split (running totals through the plan):
- Task 1: 76 → 78 (+2 IPC types)
- Task 2: 78 → 82 (+4 preload — split from 3)
- Task 3: 82 → 91 (+10 auto-update minus 1 Phase 2 stub = +9)
- Task 4: 91 → 91 (glue, no new tests)
- Task 5: 91 → 96 (+5 UpdateBanner)
- Task 6: 96 → 98 (+2 store) → 99 (+1 App)
- Task 7: 3 installer-script tests (added H2 guard test)

Plan DoD updated: **~99 configurator unit tests + 3 installer-script tests**.

**Verdict (post-resolution): ✅ READY TO EXECUTE.** All blockers resolved. Final plan tip will be visible once Phase 3 lands and Phase 4 branch is created.

---

## Round 2 (post–Round 1 resolutions)

**Verdict: ✅ READY TO EXECUTE** — C1/H1/H2/H3/M4/M5 verified in plan. One doc drift in Task 11 CHANGELOG (non-blocking).

### Verification matrix

| # | Check | Result |
|---|--------|--------|
| **C1** | Split IPCs + API + factory; Task 6 handlers; smoke/CHANGELOG | ✅ No `downloadAndInstallUpdate` / `DOWNLOAD_AND_INSTALL` / `downloadFinished` anywhere in plan |
| **H1** | Promise dance removed; try/catch on `downloadUpdate` | ✅ |
| **H2** | `artifactName` from `version`; `tag !== \`v${version}\`` guard + test | ✅ |
| **H3** | Task 4 Step 3 prescriptive DELETE | ✅ L946–950 **(a) DELETE** … **(b) Replace** |
| **M4** | 9-channel test title + 3 new asserts | ✅ L103–111 |
| **M5** | `CSC_KEY_PASSWORD` `::error::` | ✅ L1994–1996 |
| **7** | DoD ~99 + 3 installer tests | ✅ DoD L33–34; running totals L273, L427, L822, L1323, L1621 |

### Evidence (spot checks)

**C1 — end-to-end split**

```245:247:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
  CHECK_FOR_UPDATES: "check-for-updates",
  DOWNLOAD_UPDATE: "download-update",
  QUIT_AND_INSTALL: "quit-and-install",
```

```262:263:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
  [IPC_CHANNELS.DOWNLOAD_UPDATE]: { req: void; res: void };
  [IPC_CHANNELS.QUIT_AND_INSTALL]: { req: void; res: void };
```

```783:811:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
    downloadUpdate: async () => {
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        setStatus({ status: "error", ... });
      }
    },
    quitAndInstall: () => {
      if (status.status !== "ready-to-install") {
        return;
      }
      autoUpdater.quitAndInstall();
    },
```

```891:897:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, () => updater.downloadUpdate());
    ipcMain.handle(IPC_CHANNELS.QUIT_AND_INSTALL, () => {
      updater.quitAndInstall();
    });
```

```1487:1514:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
  const handleUpdateClick = async (): Promise<void> => {
    ...
      await getApi().downloadUpdate();
  ...
  const handleRestartClick = async (): Promise<void> => {
    ...
      await getApi().quitAndInstall();
```

Smoke L2473–2480 + CHANGELOG L2377 — two-step UX aligned.

**H2**

```1689:1699:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
  it("throws when tag doesn't equal v${version} (Cursor H2 guard)", () => {
    ...
    ).toThrow(/tag\/version mismatch/);
```

```1773:1781:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase4.md
if (tag !== `v${version}`) {
  ...
const artifactName = `TallyMCP-Setup-v${version}.exe`;
```

Expected URL L1669: `.../TallyMCP-Setup-v1.0.0.exe` (version-derived).

### New / residual (non-blocking)

**N-R2-1 — Task 11 CHANGELOG test math stale vs DoD**  
DoD L33: **~99** configurator + **3** installer-script tests. CHANGELOG L2363–2370 still says “2 unit tests”, “~96 + 2 installer”, “3 preload”, “8 auto-update”. Implementation tasks (L1621, L33) are correct — fix CHANGELOG bullet when executing Task 11.

**N-R2-2 — “returns immediately” semantics**  
`downloadUpdate` still `await autoUpdater.downloadUpdate()` (L792). Means: no `quitAndInstall` in same call + rejection → `error` state (H1). Real electron-updater may hold the IPC until download completes; UI still streams via `subscribeUpdateStatus`. Not a Round 1 regression.

**N-R2-3 — Task 4 Step 1 prose says “2 new channels”** (L851) but registers **3** (`CHECK_FOR_UPDATES` + download + quit) — cosmetic.

### Round 2 verdict

**✅ READY TO EXECUTE** — all Round 1 blockers closed in plan text. Patch **N-R2-1** during Task 11 so release notes match DoD counts.

### Round 2 nit resolutions (applied inline before any Phase 4 execution starts)

| # | Resolution |
|---|---|
| **N-R2-1** | **Fixed in Task 11 CHANGELOG section.** Updated stale counts: "8 auto-update" → "10 auto-update (net +9 after replacing the Phase 2 stub)"; "3 preload" → "4 preload" (the C1 split added a fourth method); "2 unit tests" for generate-latest-json → "3 unit tests" (added the H2 guard test); "~96 configurator + 2 installer" → "~99 configurator + 3 installer-script" (matches the Phase 4 DoD). Also updated Task 13's "Configurator unit tests should be ~96" → "~99" and the "What ships" section. |
| **N-R2-2** | **No action — documented observation.** `await autoUpdater.downloadUpdate()` semantics (download promise resolves after completion, not after start) is electron-updater's behavior; not a regression. UI still streams progress via `subscribeUpdateStatus`. |
| **N-R2-3** | **Fixed in Task 4 Step 1.** "Add IPC handlers for the 2 new channels" → "Add IPC handlers for the 3 new update channels (CHECK_FOR_UPDATES, DOWNLOAD_UPDATE, QUIT_AND_INSTALL per the Cursor C1 split)". Prose now matches the registered count. |

All Cursor findings on Phase 4 plan (C1 + H1–H3 + M4 + M5 + N-R2-1 + N-R2-3) now closed. Plan is fully execution-ready pending Phase 3 merge.

**Final Round 2 verdict (post-nit-cleanup): ✅ READY TO EXECUTE.**
