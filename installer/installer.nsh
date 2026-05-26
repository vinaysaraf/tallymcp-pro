; Custom NSIS macros for the TallyMCP installer.
;
; Referenced from apps/configurator/electron-builder.yml via nsis.include.
; electron-builder generates the surrounding installer.nsi and injects
; these macros at the right hook points. We only need to define the
; customUnInstall macro; everything else is electron-builder's default.

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
