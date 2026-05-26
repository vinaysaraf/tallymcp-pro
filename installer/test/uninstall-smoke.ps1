<#
.SYNOPSIS
  Locally smoke-test the built TallyMCP uninstaller.

.DESCRIPTION
  Locates the bundled uninstaller at <InstallDir>\Uninstall TallyMCP.exe,
  runs it with /S (silent) flag, then asserts cleanup:
    - install dir is gone
    - Start Menu shortcut is gone
    - tallymcp-pro is no longer in claude_desktop_config.json (if it was)
    - Windows Firewall rule "TallyMCP - Tally XML port 9000" is gone
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
$fwQuery = netsh advfirewall firewall show rule name="TallyMCP - Tally XML port 9000" 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "  X firewall rule still present" -ForegroundColor Red
  $failed += "firewall-present"
} else {
  Write-Host "  + firewall rule removed (or never existed)"
}

# 5. tally.ini restore - only assert if a .tallymcp-bak exists somewhere
#    we can find. The autofixer normally removes the .bak after restoring;
#    so if the .bak is missing AND the original ini doesn't have our two
#    lines, that's also a pass.
$tallyDir = "C:\Program Files\TallyPrime"
$tallyIni = Join-Path $tallyDir "tally.ini"
if (Test-Path $tallyIni) {
  $iniText = Get-Content $tallyIni -Raw
  if ($iniText -match "Client Server=Both" -or $iniText -match "ServerPort=9000") {
    Write-Host "  X tally.ini still has TallyMCP XML lines" -ForegroundColor Red
    $failed += "tally-ini-stale"
  } else {
    Write-Host "  + tally.ini does not contain TallyMCP XML lines"
  }
}

if ($failed.Count -gt 0) {
  Write-Error "[uninstall-smoke] FAIL: $($failed -join ', ')"
  exit 1
}

Write-Host "[uninstall-smoke] OK - uninstall cleaned up everything" -ForegroundColor Green
exit 0
