# Cursor review — Phase 3 plan (NSIS installer)

**Date:** 2026-05-26  
**Branch:** (not yet created — plan-only review)  
**Plan:** `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.md` (~1,890 lines, 14 tasks)  
**Spec:** `docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md` v1.0.1 (§8, §9, §11.2, §12, Appendix D)  
**Baseline:** Configurator **69** unit tests on current `main` / Phase 2 branch (verified)

---

## Findings

### Critical

_None — if Task 5 Electron bootstrap is patched before execution (see High H1)._

### High

**H1 — `--uninstall-cleanup` must use `app.whenReady()` (Task 5)**  
Task 5 wires cleanup at module top level with a bare async IIFE + `app.quit()` (`plan` L748–762). Electron does not guarantee `app` / `process.env` are ready until `app.whenReady()`. NSIS `ExecWait` needs a clean process exit; a race here yields silent no-op cleanup or hang.

```748:762:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.md
if (process.argv.includes("--uninstall-cleanup")) {
  void (async () => {
    const { runUninstallCleanup } = await import("./uninstall-cleanup.js");
    ...
    app.quit();
  })();
} else if (process.env.NODE_ENV !== "test") {
```

**Fix:** `app.whenReady().then(async () => { await runUninstallCleanup(); app.exit(0); });` and `app.requestSingleInstanceLock()` / `app.disableHardwareAcceleration()` optional; do not open a window.

**H2 — `customUnInstall` hook choice is correct (Task 4) — plan comment stands**  
Verified against electron-builder `uninstaller.nsh`: `customUnInstall` is expanded **before** the `RMDir /r $INSTDIR` block (not after). `ExecWait '"$INSTDIR\TallyMCP.exe" --uninstall-cleanup'` can see the exe on disk. Use `customRemoveFiles` only if you need logic *inside* the default delete path; pre-delete cleanup belongs in `customUnInstall` as written.

### Medium

**M1 — Spec install path vs plan path (§11.2 / Appendix A vs Tasks 1 + 3)**  
Spec §11.2 integration checks reference `%LOCALAPPDATA%\TallyMCP\`; plan + CHANGELOG (Task 12) move canonical install to `%LOCALAPPDATA%\Programs\TallyMCP\` (electron-builder user-mode default). Intentional and documented in-plan, but **spec text is stale** — update spec §6.1 Ollama path + §11.2 before Phase 4 CI asserts wrong directory.

**M2 — Stale wire-path comments still say `mcp-server\main.js` (Tasks 3 + Phase 3 DoD)**  
Task 6 correctly patches `ipc-handlers` + test to `mcp-server\dist\main.js` (L891–919), but Task 3 `electron-builder.yml` comment block (L357–360) and Phase 3 DoD bullet (L29) still cite `main.js`. Subagents copying the yml comment could regress the fix.

**M3 — Task 1 packaged exe fixture name is misleading (not blocking)**  
Test uses `TallyMCP Configurator.exe` (L99); smoke + NSIS use `TallyMCP.exe` (`productName: TallyMCP`, Task 3 L339, Task 4 L453). `dirname()` result is the same; rename fixture to `TallyMCP.exe` for clarity.

**M4 — Task 3 commits before Task 4 creates `installer.nsh`**  
`nsis.include: ../../installer/installer.nsh` (L384) does not exist until Task 4. Task 3 Step 3 only runs `--help` (no full build). First real parse is Task 8 — acceptable if order 1→14 is honored; note in orchestrator.

**M5 — §11.2 headless install CI deferred; local smoke only**  
Tasks 10–11 cover install/uninstall layout + config/firewall assertions locally. Spec §11.2 Windows CI is explicitly Phase 4 — not a plan gap for Phase 3 scope.

### Nit

**N1 — Placeholders / TDD:** No `TBD`, `TODO`, or “implement later” in task bodies. Every implementation step includes full code blocks. ✓

**N2 — Symbol consistency (cross-task):**  
| Chain | Status |
|-------|--------|
| `resolveInstallDir` → `index.ts` Step 5 (L186–195) | ✓ |
| `runUninstallCleanup` / `UninstallCleanupContext` / `Result` → tests + NSIS (L454, L748, L1514) | ✓ (`--uninstall-cleanup` everywhere; spec Appendix D uses legacy `--uninstall-clients` / `configurator.exe`) |
| `productName: TallyMCP` → `TallyMCP.exe` / `Uninstall TallyMCP.exe` | ✓ |
| `extraFiles` staging paths ↔ Tasks 6–7 | ✓ |
| Task 6 `ipc-handlers.test.ts` args assertion | ✓ present in plan (L909–919) |

**N3 — Execution order:** Strict 1→14 is safe. No Phase-2-style “Task 21 before 20b” inversion. Task 6 Step 4 expects 76 tests only after Task 5 (+4) — order respected.

**N4 — Phase 2 embedded patches:**  
- **Task 1 install-dir:** Dev path moves `%LOCALAPPDATA%\TallyMCP` → `%LOCALAPPDATA%\Programs\TallyMCP`. Unit/E2E should stay green (E2E launches unpackaged `dist/main`; mocks unaffected). Manual re-wire note in Task 13 §7 is correct.  
- **Task 6 wire path:** Plan includes handler + `ipc-handlers.test.ts` update; current tree still has `main.js` (pre-Phase-3) — patch is specified, not missing.

**N5 — Test count math:** 69 + 3 (Task 1) + 4 (Task 5) = **76**. Stated consistently (L32, L182, L778, L1809). ✓

**N6 — `/S` + `oneClick: false`:** electron-builder `un.onInit` parses `/S` (template); install-smoke comment (L1411–1412) is correct. Assisted installer silent install is supported.

**N7 — Windows runtime assumptions:** `fetch-node.mjs` uses `Expand-Archive` on win32 + `unzip` fallback (L1027–1036); `pnpm package:install` requires `pwsh` (Task 8 L1167) — fine on Win10/11. Pin `NODE_VERSION` is explicit.

**N8 — Deferred list (Q10):** Icons, EV cert, `latest.json`, CI pipeline are **not** Phase 3 spec blockers (§9 CI + §12 landing/updater are Phase 4/5). ✓

---

## Spec coverage (Phase 3 slice)

| Spec area | Plan coverage | Gap? |
|-----------|---------------|------|
| **§8** repo `installer/` + `electron-builder.yml` | Tasks 2–4, 3 | Icons deferred (nit) |
| **§9** build/package/sign | Tasks 7–9, 8 (`pnpm package`); publish/`release.yml` → Phase 4 | CI automation deferred by design |
| **§11.2** headless install/uninstall | Tasks 10–11 (local PS1); path uses `Programs\TallyMCP` not spec’s `TallyMCP` | M1 path drift; CI wiring Phase 4 |
| **§12 DoD** (full v1.0) | Phase 3 DoD (L25–33) is subset; landing/`latest.json`/all §11 layers → later phases | Expected |
| **Appendix D** uninstall hook | Task 4 `customUnInstall` + Task 5 cleanup (superset: clients + ini + firewall in one exe call) | Arg name differs from spec sample (`--uninstall-cleanup` vs `--uninstall-clients`) — internally consistent |

---

## Verdict

**🟡 READY TO EXECUTE WITH FOLLOW-UPS** — Plan is thorough, placeholder-free, and test math checks out. Patch **H1** (`app.whenReady` for `--uninstall-cleanup`) in the plan before subagents start Task 5; fix **M2** stale `main.js` comments so Task 6's wire-path migration cannot be copied wrong. No deferred Phase 3 item is a spec blocker.

---

## Round 1 resolutions (applied inline to the plan + spec, pre-execution)

| # | Severity | Resolution |
|---|---|---|
| **H1** | High | **Fixed in plan Task 5.** `--uninstall-cleanup` boot is now wrapped in `app.whenReady().then(async () => { ... app.exit(0); })` — matches Cursor's recommendation verbatim. Added inline comment explaining why `app.exit(0)` over `app.quit()` (NSIS `ExecWait` needs a deterministic exit; `app.quit()` can hang on pending event-loop work). |
| **H2** | High | **No action — confirmation.** Cursor verified that `customUnInstall` runs before `RMDir /r $INSTDIR`, so the configurator exe is still on disk when invoked. |
| **M1** | Medium | **Fixed in spec.** Updated all 7 occurrences of `%LOCALAPPDATA%\TallyMCP\` → `%LOCALAPPDATA%\Programs\TallyMCP\` (§4.1, §4.2 Decisions 1+5, §6.1, §11.2, Appendix A). Bumped spec to v1.0.2 with a revision-history entry pointing at this Cursor finding. Local-only file (gitignored). |
| **M2** | Medium | **Fixed in plan.** Three stale `mcp-server\main.js` refs scrubbed: the Architecture header (L7), the Phase 3 DoD bullet (L29), and the electron-builder.yml comment block in Task 3 (L357–360). All now correctly say `mcp-server\dist\main.js` with a note explaining the `pnpm deploy --prod` layout. Task 6's "OLD code shown for the change-FROM instruction" + Task 6's explanatory prose + the CHANGELOG migration note were left intact (those are historical context, not stale references). |
| **M3** | Medium | **Fixed in plan Task 1 test.** `TallyMCP Configurator.exe` fixture renamed to `TallyMCP.exe` (matches `productName: TallyMCP` from Task 3 + the NSIS exe + smoke scripts). `dirname()` result identical so the test still asserts the same thing, just with the correct name. |
| **M4** | Medium | **No action — confirmation.** Task 3 commits before Task 4 creates `installer.nsh`, but Task 3 only does an `electron-builder --help` parse-check (no real build). First real `nsis.include` resolution is in Task 8's `pnpm package`, by which point Task 4 has landed. Strict 1→14 order honors this. |
| **M5** | Medium | **No action — confirmation.** §11.2 CI on `windows-latest` is explicitly Phase 4; not a Phase 3 gap. |
| **N1–N8** | Nit | **No action — all confirmations.** Placeholders ✓, symbol consistency ✓, execution order ✓, embedded Phase 2 patches ✓, test count math (76) ✓, `/S` + `oneClick:false` compat ✓, Windows runtime assumptions ✓, deferred list ✓. |

## Final post-resolution tip

Plan file: `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.md` (~1,895 lines after fixes).
Spec file: `docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md` v1.0.2 (path drift fixed).
Both are local-only / gitignored — no commit needed before execution.

**Verdict (post-resolution): ✅ READY TO EXECUTE.** H1 patched, M1/M2/M3 patched, M4/M5/H2/N1-N8 confirmations.

---

## Round 2 (re-verification)

**Scope:** Confirm Round 1 inline fixes in plan + spec v1.0.2 (local-only files).

### H1 — `app.whenReady()` + `app.exit(0)`

**✅ Resolved.** Task 5 (plan L758–772) uses `app.whenReady().then(async () => { … runUninstallCleanup(); app.exit(0); })` with inline rationale for NSIS `ExecWait` (deterministic exit vs `app.quit()` hang). Matches NSIS expectations.

**Nit:** Add `.catch((err) => { console.error(err); app.exit(1); })` on the `whenReady` chain so a thrown `runUninstallCleanup` cannot leave the uninstaller waiting forever — not a plan blocker.

### M2 — stale `mcp-server\main.js` grep

**✅ Resolved for normative paths.** Active refs use `mcp-server\dist\main.js` (Architecture L7, DoD L29, Task 3 yml comments L361–363, smoke L1434, etc.). Remaining bare `main.js` hits are only: Task 6 OLD-code / Option A–B blocks (L883–906), CHANGELOG “was … main.js” (L1640), manual-smoke migration note (L1794), deploy-script `dist/main.js` paths — all allowed historical/explanatory context.

### M3 — exe name `TallyMCP.exe`

**✅ Test + runtime aligned.** Task 1 fixture (L100), Task 3 `productName: TallyMCP` (L340), Task 4 NSIS `TallyMCP.exe` (L456), install-smoke (L1422). **Nit:** Two prose lines still say `TallyMCP Configurator.exe` — `install-dir.ts` JSDoc (L149) and `installer/README.md` Layout bullet (L250); subagents should follow Task 4/3, not those comments.

### M1 — spec install-dir paths

**✅ `%LOCALAPPDATA%\TallyMCP\` scrubbed** (grep finds none outside revision-history “was” note, v1.0.2 L14). Normative paths use `%LOCALAPPDATA%\Programs\TallyMCP\` (§4.1 L85, §4.2 L111/115, §6.1 L160, §11.2 L330, Appendix A L383–384).

**Nit (spec, non-blocking):** §6.2 sample JSON (L168–171) still shows `AppData\Local\TallyMCP\` + `mcp-server\main.js`; §4.1 diagram (L88–89, L103) still says `configurator.exe` / `mcp-server\main.js`. Plan is canonical for Phase 3; align spec snippet when convenient.

### New from resolutions

- Architecture header now invokes `TallyMCP.exe --uninstall-cleanup` (L7) — consistent with Task 4.
- No regressions vs Round 1 verdict items.

### Round 2 verdict

**✅ READY TO EXECUTE** — Round 1 blockers closed. Optional nits: `whenReady` `.catch`, two `Configurator.exe` prose stragglers, spec §6.2 sample paths.

### Round 2 nit resolutions (applied inline)

All three Round 2 nits were addressed since the work is contained and cheap:

| # | Resolution |
|---|---|
| `whenReady` `.catch` | **Added in plan Task 5.** The `app.whenReady().then(...)` chain now has a `.catch((err) => { console.error("[uninstall-cleanup] fatal:", err); app.exit(1); })` tail. `runUninstallCleanup` is designed not to throw (its tests prove that), so this catches only catastrophic failures (dynamic `import()` error, Electron init issue). Exit code 1 keeps NSIS `ExecWait` moving — installer.nsh ignores the code per its own design but a clean exit is the contract. |
| `Configurator.exe` stragglers | **Plan L149 (install-dir.ts JSDoc) + L250 (installer/README.md layout bullet)** both renamed `TallyMCP Configurator.exe` → `TallyMCP.exe`. Grep verifies zero remaining `TallyMCP Configurator.exe` in the plan. |
| Spec §4.1 diagram + §4.2 Decision 2 | **Updated.** Diagram (§4.1 L88–89) now shows `mcp-server\dist\main.js` + `TallyMCP.exe` (was `mcp-server\main.js` + `configurator.exe`). Decision 2 prose (§4.2 L112) updated to `TallyMCP.exe` + `mcp-server\dist\main.js` with note that the server runs under bundled `node.exe`. Spec bumped to **v1.0.3** with a revision-history entry. Appendix D's NSIS sample at L445 intentionally preserved as the original design sketch — the v1.0.3 note explicitly states Phase 3's `customUnInstall` macro supersedes it. |

Final tip after Round 2 nit cleanup:
- Plan: `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.md` (~1,910 lines after Round 2 additions).
- Spec: `docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md` **v1.0.3**.
- No live stragglers in either file (only Appendix D's documented historical sketch + revision-history "was" references remain).

**Verdict (post-Round-2-nit-cleanup): ✅ READY TO EXECUTE — no remaining items.**
