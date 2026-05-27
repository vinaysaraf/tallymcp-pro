; Custom NSIS macros for the TallyMCP installer.
;
; Referenced from apps/configurator/electron-builder.yml via nsis.include.
; electron-builder generates the surrounding installer.nsi and injects
; these macros at the right hook points. We only need to define the
; customUnInstall macro; everything else is electron-builder's default.

!macro customHeader
  ; Phase 4 v1.0.2 — show per-file extraction details in the NSIS wizard.
  ; electron-builder's common.nsh sets `ShowInstDetails nevershow` AFTER our
  ; include via nsis.include; only customHeader runs AFTER common.nsh (see
  ; electron-builder installer.nsi L38-40), so this is the only hook that
  ; takes precedence. Without these directives the wizard shows an empty
  ; white space below the progress bar for the entire install duration —
  ; perceived as "frozen" especially over high-latency remote desktop.
  ;
  ; Companion fix in installer/scripts/patch-installSection.mjs replaces
  ; `SetDetailsPrint none` → `SetDetailsPrint both` in
  ; node_modules/.../installSection.nsh so the per-file log lines actually
  ; print. Both fixes are needed; either alone is insufficient.
  ; (Cursor verdict 2026-05-27 on ai-review/v1.1-installer-ux-issues.md)
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customUnInstall
  ; Run the configurator's --uninstall-cleanup mode BEFORE NSIS removes
  ; the install dir. This invocation handles three cleanup actions that
  ; NSIS can't do natively:
  ;   1. Removes the "tallymcp-pro" entry from each of the 5 AI client
  ;      config files (Claude Desktop, Cursor, Claude Code, LM Studio,
  ;      Ollama bridge). Uses @tallymcp/client-wirer's remove() path.
  ;   2. Restores tally.ini from .tallymcp-bak if present, removing the
  ;      "Client Server=Both" + "ServerPort=9000" lines we added.
  ;   3. Removes the Windows Firewall rule "TallyMCP — Tally XML port
  ;      9000" if present (requires admin; skipped silently otherwise).
  ;
  ; ExecWait blocks until the configurator process exits. Its exit code
  ; is intentionally ignored — a partial cleanup failure shouldn't
  ; abort the uninstaller, which still needs to wipe the install dir.

  DetailPrint "TallyMCP: cleaning up AI client configs, tally.ini, firewall rule..."
  ExecWait '"$INSTDIR\TallyMCP.exe" --uninstall-cleanup'
!macroend
