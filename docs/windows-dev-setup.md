# Windows Developer Setup (Primary)

TallyMCP Pro is developed on **Windows** where TallyPrime runs locally. This is the primary dev environment.

## Prerequisites

- Windows 10/11
- Node.js **20 LTS**
- pnpm 9+ (`npm install -g pnpm`)
- TallyPrime 4.x with XML interface enabled
- Cursor IDE

## First-time setup

```powershell
cd "C:\Projects\Tally MCP"   # your path

pnpm install
pnpm build
pnpm test
pnpm hello-tally
```

## Tally XML configuration

1. Open TallyPrime and **load a company**
2. **F1 → Settings → Connectivity → Client/Server Configuration**
3. **TallyPrime acts as:** Both
4. Port: **9000**

## Firewall

Allow inbound TCP 9000. Prefer a rule for **All profiles**:

```powershell
New-NetFirewallRule -DisplayName "Tally XML 9000 All Profiles" -Direction Inbound -Protocol TCP -LocalPort 9000 -Action Allow -Profile Any
```

Set Wi‑Fi to **Private** (not Public):

```powershell
Get-NetConnectionProfile | Where-Object {$_.InterfaceAlias -eq "Wi-Fi"} | Set-NetConnectionProfile -NetworkCategory Private
```

## Verify Tally responds

```powershell
pnpm diagnose-tally
pnpm hello-tally
```

`diagnose-tally` returns CA-friendly hints when XML is off, no company is loaded, or the port is wrong.

Or PowerShell:

```powershell
$body = Get-Content -Raw "samples\list-companies.request.xml"
Invoke-WebRequest -Uri "http://127.0.0.1:9000/" -Method POST -ContentType "text/xml; charset=utf-8" -Body $body -UseBasicParsing
```

Expect `<COMPANY>` entries inside `<DATA>`.

## Cursor

Open **`CURSOR_START_WINDOWS.md`** and paste the Cursor Agent prompt to begin Phase 1.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm diagnose-tally` | CA-friendly connection diagnostic (recommended) |
| `pnpm hello-tally` | Live test against 127.0.0.1:9000 |
| `pnpm hello-tally:fixture` | Offline envelope check (no Tally) |
| `pnpm scan-tally` | Scan local subnet for Tally (LAN dev) |
| `TALLY_LIVE=1 pnpm --filter @tallymcp/tally-connector test` | Optional live Vitest against running Tally |
| `pnpm dev:mcp` | MCP server dev mode (after Phase 1 M1.7) |

## Co-working / isolated Wi‑Fi

If developing from Mac was needed, see `docs/mac-dev-setup.md`. For Windows-only dev on localhost, co-working Wi‑Fi isolation does not matter — use `127.0.0.1`.
