<#
.SYNOPSIS
  Locally smoke-test the built TallyMCP installer.

.DESCRIPTION
  Finds the latest TallyMCP-Setup-*.exe under apps/configurator/dist-installer,
  runs it with /S (silent) flag, then asserts the expected install layout:
    - TallyMCP.exe present at install dir root
    - node.exe present at install dir root
    - mcp-server/main.bundle.js present (v1.0.5+ single esbuild bundle; no node_modules)
    - Start Menu shortcut present
  Exits 0 on success, 1 on any assertion failure. Does NOT uninstall;
  pair with uninstall-smoke.ps1 for the full round-trip.

.PARAMETER InstallDir
  Optional override for the expected install dir. Defaults to
  %LOCALAPPDATA%\Programs\TallyMCP — electron-builder's user-mode default.

.NOTES
  Phase 4 will wire this into windows-latest CI. For now, run manually
  on a Windows machine after `pnpm package` succeeds.
#>

param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\TallyMCP")
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$distDir = Join-Path $repoRoot "apps\configurator\dist-installer"

if (-not (Test-Path $distDir)) {
  Write-Error "no dist-installer at $distDir — run 'pnpm package' first"
  exit 1
}

$installer = Get-ChildItem -Path $distDir -Filter "TallyMCP-Setup-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $installer) {
  Write-Error "no TallyMCP-Setup-*.exe in $distDir"
  exit 1
}

Write-Host "[install-smoke] installer: $($installer.FullName)"
Write-Host "[install-smoke] expected install dir: $InstallDir"

# /S = silent install (works with electron-builder NSIS oneClick:false too;
# it skips the dir-picker dialog and uses the default).
Write-Host "[install-smoke] running silent install..."
$proc = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
if ($proc.ExitCode -ne 0) {
  Write-Error "installer exited with code $($proc.ExitCode)"
  exit 1
}

# Assert the expected files exist.
# v1.0.5+: mcp-server ships as a single esbuild bundle (main.bundle.js).
# No dist/ subdir and no node_modules tree under mcp-server/.
$mustExist = @(
  (Join-Path $InstallDir "TallyMCP.exe"),
  (Join-Path $InstallDir "node.exe"),
  (Join-Path $InstallDir "mcp-server\main.bundle.js"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\TallyMCP.lnk")
)

$failed = @()
foreach ($p in $mustExist) {
  if (Test-Path $p) {
    Write-Host "  ✓ $p"
  } else {
    Write-Host "  ✗ $p" -ForegroundColor Red
    $failed += $p
  }
}

if ($failed.Count -gt 0) {
  Write-Error "[install-smoke] FAIL: $($failed.Count) expected path(s) missing"
  exit 1
}

# Smoke-test node.exe runs.
$nodeExe = Join-Path $InstallDir "node.exe"
$nodeVer = & $nodeExe --version
if ($LASTEXITCODE -ne 0) {
  Write-Error "[install-smoke] FAIL: bundled node.exe failed to run"
  exit 1
}
Write-Host "[install-smoke] bundled node.exe → $nodeVer"

Write-Host "[install-smoke] OK — install layout matches expectations" -ForegroundColor Green
exit 0
