# Phase 2 Manual Smoke — Electron Configurator

Run on a Windows machine with TallyPrime installed and a company loaded. Reuses the synthetic-fixture pattern from Phase 1 — your real config files stay untouched.

## 1. Build + launch the Configurator in dev mode

```powershell
cd "C:\Projects\Tally MCP"
pnpm install
pnpm -r build
pnpm --filter @tallymcp/configurator dev
```

Expected: an Electron window titled "TallyMCP Configurator" opens within ~5 s, showing the tile grid home screen with 5 client tiles.

## 2. Verify the status banner reflects live Tally state

With Tally CLOSED:
- Banner should show "Tally not reachable" (red dot) within 5 s of opening the app.

With Tally OPEN + a company loaded:
- Banner should show "Tally connected — <CompanyName>" (green dot) + "MCP server running" — both within 5 s.

## 3. Health Check screen

- Click "Health Check" in the nav.
- All four lines render: TallyPrime found / running / XML interface / Firewall rule.
- If XML interface is OFF, the "Fix both, continue" button is visible.
- Click it (Tally must be closed). Verify tally.ini is updated (Client Server=Both + ServerPort=9000) AND `.tallymcp-bak` is created. Firewall step warning appears in console (non-admin).

## 4. Settings screen

- Click "Settings" in the nav.
- Verify the install dir, TallyPrime folder, version are all displayed correctly.
- Click "Run health check" — refreshes status without leaving the screen.

## 5. Restore Tally settings

With Tally CLOSED:
- From Settings, click "Restore Tally settings".
- Confirm the RestoreConfirmModal: read the 2-step plan + amber warning, then click "Restore".
- Verify tally.ini is restored from `.tallymcp-bak` (XML interface lines are GONE again).
- Firewall rule (if it was ever added) is removed.

## 6. Add MCP modal

- From Home, click "+ Add MCP" on the Claude Desktop tile.
- Modal opens with:
  - "I will do exactly 3 things" plain-English info box
  - Green "What WILL NOT happen" trust block
  - Yellow AV warning with "Show me what to click →" link
- Click "Show me what to click →" — verify SmartScreenGuide popup opens with both annotated dialogs.
- Close it (Got it).
- In the Add MCP modal, click "Add MCP" — verify `%APPDATA%\Claude\claude_desktop_config.json` now contains `tallymcp-pro` entry alongside any existing servers.
- The DoneScreen overlay appears with the success checkmark and a sample question ("What's my sales for FY 22-23?"). Click Close.

## 7. Verify-all-reports still 12/12

Outside the Electron app:
```powershell
pnpm verify-all-reports
```
Expected: 12/12 reports pass — Phase 2 hasn't broken Phase 1 or v0.7.

## 8. Close and cleanup

- Close the Configurator window.
- Manually `unwire claude-desktop` via the Phase 1 CLI (since the app's "Unwire" UI is not in Phase 2 scope — that's a deferred Phase 2.1 polish):

```powershell
node apps\cli\dist\main.js unwire claude-desktop --yes
```

This returns the Claude Desktop config to its pre-smoke state.
