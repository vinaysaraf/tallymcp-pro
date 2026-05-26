# Phase 3 Manual Smoke — NSIS Installer Round-Trip

Run on a Windows 10/11 machine with TallyPrime installed and a company
loaded. The first install pass leaves a Configurator + bundled MCP
server + wired Claude Desktop on your machine; the uninstall pass
should clean every trace.

## 1. Build the installer

```powershell
cd "C:\Projects\Tally MCP"
pnpm install
pnpm package
```

Expected (~5 minutes wall-clock):
- `pnpm -r build` succeeds.
- `installer/staging/node.exe` (~30 MB) staged.
- `installer/staging/mcp-server/dist/main.js` + `node_modules/` staged.
- `apps/configurator/dist-installer/TallyMCP-Setup-v0.0.1.exe` (~150 MB) built.
- `apps/configurator/dist-installer/TallyMCP-Setup-v0.0.1.exe.sha256` written.

If `CSC_LINK` is set: console shows `signing ...`. Otherwise: console
shows `⚠ skipping code signing`.

## 2. Run the installer manually (one-screen wizard)

Double-click `TallyMCP-Setup-v0.0.1.exe`. SmartScreen will show
"Windows protected your PC" because we're self-signed — click "More
info" → "Run anyway" (this matches the Configurator's SmartScreenGuide
walkthrough; that screen is also one of the post-install QA targets).

Expected wizard flow:
- One screen, no install-dir picker (locked to `%LOCALAPPDATA%\Programs\TallyMCP\`).
- Install completes in ~10 seconds (small payload + no native compile).
- Configurator launches automatically on finish.

## 3. Verify the install layout (PowerShell)

```powershell
$dir = "$env:LOCALAPPDATA\Programs\TallyMCP"
Get-ChildItem $dir | Select-Object Name,Length | Format-Table
```

Expected entries (subset):
- `TallyMCP.exe` — the Electron app.
- `node.exe` — bundled portable Node 20.18.1.
- `mcp-server\` — directory with `dist/main.js` + `node_modules/`.
- `resources\` — electron-builder's app resources.
- `Uninstall TallyMCP.exe` — the bundled NSIS uninstaller.

Or use the included smoke script:

```powershell
pnpm package:install
```

Expected: `[install-smoke] OK — install layout matches expectations`.

## 4. Configurator end-to-end (manual)

With Tally CLOSED initially:
- Configurator's status banner: "Tally not reachable" (red dot) within 5 s.

Open TallyPrime + load any company. Within 5 s of company-load:
- Status banner flips to "Tally connected — <CompanyName>" (green).

Click Claude Desktop tile → Add MCP → confirm:
- `%APPDATA%\Claude\claude_desktop_config.json` now has `tallymcp-pro` entry.
- Command: `<installDir>\node.exe`
- Args: `[<installDir>\mcp-server\dist\main.js]`

Run Claude Desktop. Ask: *"What's my sales for FY 22-23?"*. Claude
should respond by calling tools through the bundled MCP server.

## 5. Uninstall round-trip

Open Settings → Apps → installed apps, find **TallyMCP**, click Uninstall.
Or run the smoke script:

```powershell
pnpm package:uninstall
```

Expected behavior:
- NSIS uninstall dialog appears + completes in ~5 seconds.
- BEFORE wiping files, the uninstaller runs `TallyMCP.exe --uninstall-cleanup`:
  - Removes `tallymcp-pro` from each of the 5 AI client config files (if present).
  - Restores `tally.ini` from `.tallymcp-bak` (if backup present).
  - Removes the Windows Firewall rule (if admin; logs a skip otherwise).
- AFTER cleanup, NSIS wipes the install dir + Start Menu shortcut.

The smoke script asserts each step; manual inspection should match:

```powershell
# All of these should be false / not-present after uninstall:
Test-Path "$env:LOCALAPPDATA\Programs\TallyMCP"
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\TallyMCP.lnk"

$config = "$env:APPDATA\Claude\claude_desktop_config.json"
if (Test-Path $config) {
  (Get-Content $config -Raw | ConvertFrom-Json).mcpServers."tallymcp-pro"  # should be $null
}

netsh advfirewall firewall show rule name="TallyMCP — Tally XML port 9000"  # should report no rules
```

## 6. Sanity: workspace gates still green

```powershell
pnpm -r build
pnpm lint
pnpm -r test
pnpm --filter @tallymcp/configurator e2e
```

Expected: all four green. 76 configurator unit + 4 E2E + Phase 1 (118) + v0.7 (~257) tests pass.

## 7. Known Phase 3 limitations (documented; not blockers)

- **No real icons** — electron-builder's default Electron logo is the installer + app icon. Replace before tagging v1.0.0.
- **SmartScreen "Unknown publisher"** — self-signed cert; users must click "More info → Run anyway" once. SmartScreenGuide popup walks them through it.
- **No GitHub Actions release pipeline** — `pnpm package` only runs locally. Phase 4 wires this into `windows-latest` runners on tag push.
- **No `latest.json`** — auto-update infrastructure is Phase 4.
- **Wire snippet path migration** — existing dev-mode wired AI clients (from Phase 2 testing) have stale `mcp-server\main.js` paths. The Configurator's H10 hydration will still show those tiles as "Connected"; the user should click Reconfigure to refresh. Fresh installs from the NSIS .exe write the correct `mcp-server\dist\main.js` path.
