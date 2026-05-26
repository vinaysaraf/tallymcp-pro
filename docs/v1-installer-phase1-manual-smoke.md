# Phase 1 Manual Smoke

On a Windows 11 machine with TallyPrime installed and a company loaded:

## 1. Build everything

```powershell
pnpm install
pnpm -r build
```

## 2. Wire Claude Desktop

```powershell
$mockInstall = "$env:LOCALAPPDATA\TallyMCP-smoke"
New-Item -ItemType Directory -Force $mockInstall | Out-Null
# Place a placeholder node.exe + mcp-server\main.js so the paths the wirer
# writes into the config are valid for an integration check:
Copy-Item "C:\Program Files\nodejs\node.exe" "$mockInstall\node.exe"
New-Item -ItemType Directory -Force "$mockInstall\mcp-server" | Out-Null
"console.log('hello from smoke server')" | Out-File "$mockInstall\mcp-server\main.js" -Encoding ascii

node apps/cli/dist/main.js wire claude-desktop --install-dir $mockInstall
```

Expected: prints "✓ added claude-desktop → ...". Verify:
- `%APPDATA%\Claude\claude_desktop_config.json` contains a `tallymcp-pro` entry with the absolute paths.
- `claude_desktop_config.json.bak` exists.

## 3. Re-wire (idempotent)

```powershell
node apps/cli/dist/main.js wire claude-desktop --install-dir $mockInstall
```

Expected: prints "✓ noop claude-desktop → ...".

## 4. Unwire

```powershell
node apps/cli/dist/main.js unwire claude-desktop
```

Expected: prints "✓ removed claude-desktop → ...". Verify `tallymcp-pro` key is gone from the JSON.

## 5. Tally auto-fix

```powershell
# Close TallyPrime if running.
node apps/cli/dist/main.js tally-fix
```

Expected:
- prints "✓ tally.ini at C:\Program Files\TallyPrime…\tally.ini: applied"
- prints "✓ Firewall rule: added"
- prints "Now open TallyPrime and load a company."

Verify:
- `tally.ini` contains `Client Server=Both` and `ServerPort=9000`.
- `tally.ini.tallymcp-bak` exists with the pre-fix content.
- `netsh advfirewall firewall show rule name="TallyMCP — Tally XML port 9000"` lists the rule.

## 6. Confirm TallyMCP connector still works

Open TallyPrime, load a company. Then:

```powershell
pnpm verify-all-reports
```

Expected: 12/12 reports pass.

## 7. Tally restore

```powershell
# Close TallyPrime.
node apps/cli/dist/main.js tally-restore
```

Expected: prints "✓ tally.ini restored" and "✓ Firewall rule removed".

Verify:
- `tally.ini` matches the original pre-fix content.
- `netsh advfirewall firewall show rule name="TallyMCP — Tally XML port 9000"` reports "No rules match".

## 8. Re-run smoke to confirm clean state

Run steps 5 + 7 once more; verify backup-once semantics (the .tallymcp-bak is not overwritten on the second tally-fix).
