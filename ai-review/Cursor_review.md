# Cursor review — Phase 3 Configurator + NSIS installer (code)

**Date:** 2026-05-26  
**Branch:** `feat/v1.0-installer-phase3`  
**Range:** `a282e29..1593a83` (16 commits ahead of `main`)  
**Tip SHA:** `1593a83` (fix bundle `7fb2979`, audit `1593a83`)  
**Scope:** NSIS uninstall flow, install-dir + wire-path patches, `pnpm package` pipeline, smoke scripts, staging layout.

**Tests:** `pnpm --filter @tallymcp/configurator test` — **76/76** passed.

---

## Findings

### Critical

_None._

### High

**H1 — `uninstall-smoke.ps1` firewall rule name mismatch (false negative)**  
Production cleanup uses the em-dash name from `@tallymcp/tally-autofix`:

```3:3:packages/tally-autofix/src/firewall.ts
export const FIREWALL_RULE_NAME = "TallyMCP — Tally XML port 9000" as const;
```

Smoke queries an ASCII hyphen:

```91:91:installer/test/uninstall-smoke.ps1
$fwQuery = netsh advfirewall firewall show rule name="TallyMCP - Tally XML port 9000" 2>&1
```

`netsh` name matching is exact — the assertion usually passes even when the real rule remains. **Fix:** use the same Unicode `—` string (or a shared constant) in the smoke script.

### Medium

**M1 — Running Configurator can block silent uninstall before cleanup**  
electron-builder’s NSIS template runs `un.checkAppRunning` on silent uninstall. A still-open `TallyMCP.exe` (post-install auto-launch) can abort/stall uninstall before `customUnInstall` → `--uninstall-cleanup`. Hook code is fine; document “close Configurator first” in manual smoke or handle via single-instance forwarding later.

**M2 — `uninstall-smoke.ps1` tally.ini path hard-coded**  
```103:104:installer/test/uninstall-smoke.ps1
$tallyDir = "C:\Program Files\TallyPrime"
```
Non-default Tally locations get a **false pass** on ini restore. Detect via scan roots or skip unless pre-snapshot exists.

**M3 — Fresh-clone `pnpm package` needs network + Windows**  
```16:16:package.json
"package": "pnpm -r build && node installer/scripts/fetch-node.mjs && node installer/scripts/deploy-mcp-server.mjs && ..."
```
`fetch-node.mjs` hits nodejs.org on first run (cached after). `deploy-mcp-server.mjs` documents pnpm 9 relative deploy target (L44–46). Non-Windows CI cannot run the NSIS step without Wine — expected Phase 3 scope.

### Nit

**N1 — NSIS uninstall boot path: solid**  
`installer.nsh` L25 → `index.ts` L68–93: `app.whenReady().then(… app.exit(0))` + `.catch(… app.exit(1))`. `runUninstallCleanup` swallows per-step errors (L54–136). NSIS ignores exit code (by design); no window/IPC in cleanup mode — no obvious hang/leak.

**N2 — Phase 2 embedded patches: correct**  
- **install-dir:** packaged → `dirname(exePath)`; dev → `%LOCALAPPDATA%\Programs\TallyMCP` (`install-dir.ts` L32–38); wired in `index.ts` L96–102; 3 unit tests.  
- **wire-path:** `mcp-server/dist/main.js` in `ipc-handlers.ts` L58; asserted in `ipc-handlers.test.ts` L32–34.

**N3 — Staging / fresh clone: safe**  
`.gitignore` L34–35 excludes `installer/staging/` + `dist-installer/`. `electron-builder.yml` `extraFiles` L34–37; `pnpm package` repopulates staging every run.

**N4 — `install-smoke.ps1` matches documented layout**  
L60–65: `TallyMCP.exe`, `node.exe`, `mcp-server\dist\main.js`, SDK sample, Start Menu `TallyMCP.lnk`. Does not assert `Uninstall TallyMCP.exe` (uninstall smoke covers that).

---

## Verdict

**🟡 MERGE WITH FOLLOW-UPS** — Uninstall hook + Electron bootstrap are production-ready. Fix **H1** before trusting `pnpm package:uninstall` as a gate. **M1–M2** are smoke/QA hardening, not blockers for the NSIS/cleanup implementation.

---

## Round 1 resolutions (commit `7fb2979`)

All three Cursor follow-ups landed inline since they're contained to two files:

| # | Severity | Resolution |
|---|---|---|
| **H1** | High | **Fixed.** `uninstall-smoke.ps1` now constructs the firewall rule name at runtime via `$emDash = [char]0x2014` so the netsh query matches `FIREWALL_RULE_NAME` from `packages/tally-autofix/src/firewall.ts` (em-dash U+2014). Source file stays pure ASCII for cross-PowerShell-version parsing (pwsh 7 reads UTF-8 by default; Windows PowerShell 5.1 reads Windows-1252 without BOM detection — both now parse identically). Inline comment cites this Cursor finding. |
| **M1** | Medium | **Fixed.** `uninstall-smoke.ps1` now calls `Get-Process -Name "TallyMCP"` + `Stop-Process -Force` before invoking the uninstaller, defusing `un.checkAppRunning` stalls. Manual smoke doc updated with a "close Configurator first" callout for the Windows Settings UI path. |
| **M2** | Medium | **Fixed.** `uninstall-smoke.ps1` now scans both `C:\Program Files` and `C:\Program Files (x86)` for `TallyPrime*` directories (matches `detectTallyInstall`'s scan-root convention in `@tallymcp/tally-autofix`). Asserts on each found `tally.ini` independently; if zero installs found, logs an explicit "skipping" note instead of false-passing. |
| **M3** | Medium | **No action — confirmation.** Fresh-clone `pnpm package` needing network + Windows is expected Phase 3 scope (CI automation lands in Phase 4). |
| **N1–N4** | Nit | **No action — all confirmations.** NSIS boot path solid, Phase 2 patches correct, staging safe, install-smoke assertions complete. |

Configurator gates after fix: **76/76** unit tests, lint clean, typecheck clean, PS1 parses cleanly under both PowerShell 5.1 and pwsh 7.

**Verdict (post-resolution): ✅ READY TO MERGE.** Branch tip: `7fb2979` (15 commits ahead of `main`).

---

## Round 2 (re-verification of `7fb2979`)

**Scope:** Confirm H1 / M1 / M2 fixes in `uninstall-smoke.ps1` + manual smoke doc.

### H1 — em-dash firewall query

**✅ Resolved.** Runtime construction matches `FIREWALL_RULE_NAME`:

```115:117:installer/test/uninstall-smoke.ps1
$emDash = [char]0x2014
$fwRuleName = "TallyMCP $emDash Tally XML port 9000"
$fwQuery = netsh advfirewall firewall show rule name="$fwRuleName" 2>&1
```

**ASCII-only confirmed:** byte scan of `installer/test/uninstall-smoke.ps1` — 6258 bytes, **0** bytes > 0x7F. Safe for pwsh 7 + Windows PowerShell 5.1.

### M1 — Stop-Process + manual doc

**✅ Resolved and consistent.** Script stops `TallyMCP` before uninstall (L57–62). Manual smoke §5 (L78) documents closing Configurator for Settings UI uninstall; notes smoke script handles it via `Stop-Process`.

### M2 — Tally scan roots

**✅ Resolved.** Scan roots match `DEFAULT_SCAN_ROOTS` in `tally-detect.ts` L19–21:

```130:141:installer/test/uninstall-smoke.ps1
$tallyScanRoots = @("C:\Program Files", "C:\Program Files (x86)")
...
  Write-Host "  ~ no TallyPrime install found in Program Files - skipping tally.ini check"
```

**Nit:** Smoke checks any `TallyPrime*` dir with `tally.ini`; `detectTallyInstall` also requires `tally.exe` (L39–47). Divergence is harmless for typical installs; optional tighten later.

### New from fixes

- Manual smoke L107 still embeds a literal em-dash in the example `netsh` one-liner (fine for human copy-paste; script path is the gate).
- No regressions in NSIS/cleanup code paths.

### Round 2 verdict

**✅ READY TO MERGE** — Round 1 smoke/QA blockers closed. Residual items (M3 network/Windows, M2 `tally.exe` parity) unchanged and non-blocking.

### Round 2 nit resolution (commit `b7e683d`)

The single non-blocking nit (smoke scan vs `detectTallyInstall` parity) was tightened inline since it's a 2-line change. `installer/test/uninstall-smoke.ps1` now requires BOTH `tally.exe` AND `tally.ini` to count a directory as a real TallyPrime install — matches `detectTallyInstall`'s `access` checks in `packages/tally-autofix/src/tally-detect.ts`. Configurator 76/76 still green; file remains pure ASCII.

**Final tip after Round 2 nit cleanup:** `b7e683d` (17 commits ahead of `main`).

**Verdict (post-Round-2-nit-cleanup): ✅ READY TO MERGE — no remaining items.**
