<#
.SYNOPSIS
  Locally smoke-test the built TallyMCP uninstaller.

.DESCRIPTION
  Locates the bundled uninstaller at <InstallDir>\Uninstall TallyMCP.exe,
  runs it with /S (silent) flag, then asserts cleanup:
    - install dir is gone
    - Start Menu shortcut is gone
    - tallymcp-pro is no longer in claude_desktop_config.json (if it was)
    - Windows Firewall rule "TallyMCP (em-dash U+2014) Tally XML port 9000"
      is gone. The name uses an em-dash, matching FIREWALL_RULE_NAME from
      packages/tally-autofix/src/firewall.ts. The script constructs it at
      runtime via [char]0x2014 so this file stays pure ASCII for
      cross-PowerShell-version compatibility.
    - tally.ini is restored from .tallymcp-bak (if a backup existed)
  Exits 0 on success, 1 on any assertion failure.

  Run AFTER install-smoke.ps1 - this script assumes a TallyMCP install
  is present and may have wired AI client configs / edited tally.ini.

.PARAMETER InstallDir
  Optional override for the install dir. Defaults to
  %LOCALAPPDATA%\Programs\TallyMCP.
#>

param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\TallyMCP")
)

$ErrorActionPreference = "Stop"

$uninstaller = Join-Path $InstallDir "Uninstall TallyMCP.exe"
if (-not (Test-Path $uninstaller)) {
  Write-Error "[uninstall-smoke] no uninstaller at $uninstaller - was install-smoke.ps1 run first?"
  exit 1
}

Write-Host "[uninstall-smoke] uninstaller: $uninstaller"

# Pre-snapshot: capture state before uninstall.
$claudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$hadTallymcpPro = $false
if (Test-Path $claudeConfig) {
  $configJson = Get-Content $claudeConfig -Raw | ConvertFrom-Json
  if ($configJson.mcpServers."tallymcp-pro") {
    $hadTallymcpPro = $true
    Write-Host "[uninstall-smoke] pre: claude_desktop_config has tallymcp-pro entry"
  }
}

# Defensive: electron-builder's NSIS template runs un.checkAppRunning on
# silent uninstall. A still-open TallyMCP.exe (e.g., from the auto-launch
# at end of install) can stall the uninstaller before customUnInstall
# fires. Kill any running Configurator first.
# (Cursor review M1, 2026-05-26.)
$running = Get-Process -Name "TallyMCP" -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "[uninstall-smoke] stopping running TallyMCP.exe processes (count: $($running.Count))..."
  $running | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# /S = silent uninstall (electron-builder NSIS uninstaller supports this).
Write-Host "[uninstall-smoke] running silent uninstall..."
$proc = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
if ($proc.ExitCode -ne 0) {
  Write-Error "[uninstall-smoke] uninstaller exited with code $($proc.ExitCode)"
  exit 1
}

# NSIS spawns the uninstaller in a copy + detach pattern. Wait a moment
# for the install dir wipe to settle.
Start-Sleep -Seconds 3

$failed = @()

# 1. Install dir should be gone.
if (Test-Path $InstallDir) {
  Write-Host "  X install dir still exists: $InstallDir" -ForegroundColor Red
  $failed += "install-dir-present"
} else {
  Write-Host "  + install dir removed"
}

# 2. Start Menu shortcut should be gone.
$shortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\TallyMCP.lnk"
if (Test-Path $shortcut) {
  Write-Host "  X Start Menu shortcut still exists" -ForegroundColor Red
  $failed += "shortcut-present"
} else {
  Write-Host "  + Start Menu shortcut removed"
}

# 3. tallymcp-pro should be removed from Claude Desktop config (if it was there).
if ($hadTallymcpPro -and (Test-Path $claudeConfig)) {
  $configJson = Get-Content $claudeConfig -Raw | ConvertFrom-Json
  if ($configJson.mcpServers."tallymcp-pro") {
    Write-Host "  X tallymcp-pro still in claude_desktop_config.json" -ForegroundColor Red
    $failed += "claude-config-stale"
  } else {
    Write-Host "  + tallymcp-pro removed from claude_desktop_config.json"
  }
}

# 4. Firewall rule should be gone.
# IMPORTANT: the name must match FIREWALL_RULE_NAME from
# packages/tally-autofix/src/firewall.ts EXACTLY -- netsh name matching is
# exact-byte. The separator is U+2014 EM DASH, NOT an ASCII hyphen-minus.
# Constructed via [char]0x2014 so this source file stays pure ASCII and
# parses correctly under both pwsh 7 (UTF-8 default) and Windows
# PowerShell 5.1 (Windows-1252 default, no BOM detection).
# (Cursor review H1, 2026-05-26: previous ASCII-hyphen version always
# false-passed even when the real rule remained.)
$emDash = [char]0x2014
$fwRuleName = "TallyMCP $emDash Tally XML port 9000"
$fwQuery = netsh advfirewall firewall show rule name="$fwRuleName" 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "  X firewall rule still present" -ForegroundColor Red
  $failed += "firewall-present"
} else {
  Write-Host "  + firewall rule removed (or never existed)"
}

# 5. tally.ini restore - scan standard Tally locations (matches the
#    detectTallyInstall scan roots in @tallymcp/tally-autofix). If no
#    tally.ini found, log a skip note rather than silently false-passing.
#    (Cursor review M2, 2026-05-26: previous hard-coded
#    "C:\Program Files\TallyPrime" missed non-default installs.)
$tallyScanRoots = @("C:\Program Files", "C:\Program Files (x86)")
$tallyIniPaths = @()
foreach ($root in $tallyScanRoots) {
  if (Test-Path $root) {
    $tallyIniPaths += Get-ChildItem -Path $root -Filter "TallyPrime*" -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "tally.ini" } |
      Where-Object { Test-Path $_ }
  }
}

if ($tallyIniPaths.Count -eq 0) {
  Write-Host "  ~ no TallyPrime install found in Program Files - skipping tally.ini check"
} else {
  foreach ($tallyIni in $tallyIniPaths) {
    $iniText = Get-Content $tallyIni -Raw
    if ($iniText -match "Client Server=Both" -or $iniText -match "ServerPort=9000") {
      Write-Host "  X $tallyIni still has TallyMCP XML lines" -ForegroundColor Red
      $failed += "tally-ini-stale:$tallyIni"
    } else {
      Write-Host "  + $tallyIni does not contain TallyMCP XML lines"
    }
  }
}

if ($failed.Count -gt 0) {
  Write-Error "[uninstall-smoke] FAIL: $($failed -join ', ')"
  exit 1
}

Write-Host "[uninstall-smoke] OK - uninstall cleaned up everything" -ForegroundColor Green
exit 0
