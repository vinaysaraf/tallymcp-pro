# Friend's Gold Tally session — runbook (AnyDesk)

Operational checklist for installing + verifying TallyMCP **v1.0.5** on the friend's
Gold TallyPrime machine via AnyDesk. Goal: get `tally_run_audit_lite` + Trial
Balance / P&L / Balance Sheet working, and capture fixtures for #134 / #136 while
we have rare Gold-Tally access.

> The friend's machine: Gold TallyPrime, networked (Tally's own Gateway Server
> config points at `WIN-TFOD15R6P87:9999`). The MCP server still connects to the
> LOCAL XML interface at `127.0.0.1:9000` — the gateway is Tally's internal
> client/server config, not where we connect.

---

## 0. Pre-flight (before the session)

- [ ] v1.0.5 released (signed `.exe` on the GitHub release page)
- [ ] Download `TallyMCP-Setup-v1.0.5.exe` + `.sha256` locally
- [ ] Have this folder ready to transfer: `capture-tally-fixtures.ps1` + this runbook
- [ ] AnyDesk connected, file-transfer working

---

## 1. Install / upgrade to v1.0.5

If v1.0.3/v1.0.4 is already installed (from a previous attempt):
1. AnyDesk-transfer `TallyMCP-Setup-v1.0.5.exe` to the friend's machine
2. Run it → click **Next** through the "already installed, overwrite?" prompt (in-place upgrade; settings preserved)
3. The MCP crash is fixed in v1.0.5 (single bundle, no `node_modules` resolution)

Fresh install: run the `.exe`, accept the SmartScreen "Run anyway", let it install (now ~5 sec — single 4.2 MB bundle, not 3,000 files).

---

## 2. Wire Claude Desktop + Reconfigure (CRITICAL after upgrade)

- [ ] Open the Configurator → confirm version **1.0.5** in the status bar
- [ ] On the Claude Desktop tile:
  - If it shows `✓ Connected` (carried over from a prior version) → click **Reconfigure** (rewrites the wire path to `mcp-server\main.bundle.js`; the old `dist\main.js` path no longer exists)
  - If `+ Add MCP` → click it → confirm
- [ ] **Fully quit Claude Desktop from the system tray** (right-click → Quit), then reopen
- [ ] If the friend has the Microsoft Store version of Claude Desktop, the Configurator's MSIX warning will show — follow it (v1.0.3 already handles writing to the sandbox path)

---

## 3. ⚠ Edition safety-net (apply IMMEDIATELY if power tools get gated off)

The friend has **Gold**, but the edition probe (`capability.ts`) sends a 5s Trial
Balance request. On a networked gateway it can time out or return a format the
probe doesn't recognize → mislabels Gold as Silver → **gates off vouchers,
closing balances, audit-lite, and dashboards** (#134 + #136).

**If `tally_get_capabilities` reports Silver, or any tool says "gated off on
Silver", apply this 30-second fix:**

1. Open the config file (Notepad). Path on an admin install:
   ```
   C:\Program Files\TallyMCP\config.json
   ```
   (per-user install: `%LOCALAPPDATA%\Programs\TallyMCP\config.json`)
2. Replace its entire contents with the safety-net config below
3. Save
4. Fully quit Claude Desktop from the system tray → reopen (the MCP server re-reads config at spawn)

### Safety-net `config.json` (forces Gold + generous timeout for the gateway)

```json
{
  "schemaVersion": 1,
  "tally": {
    "connections": [
      { "host": "127.0.0.1", "port": 9000, "type": "local" }
    ],
    "assumedEdition": "gold",
    "unsafeSlow": true,
    "requestTimeoutMs": 60000
  },
  "output": {
    "folder": "./tallymcp-output"
  },
  "security": {
    "readOnly": true
  }
}
```

- `assumedEdition: "gold"` → **skips the probe entirely** (`context.ts` returns `fromAssumedEdition("gold")`), so no false-Silver, no probe timeout.
- `unsafeSlow: true` → belt-and-braces; even if some path still checks it, voucher tools stay enabled.
- `requestTimeoutMs: 60000` → 60s per request so the networked gateway's latency doesn't trip `TallyRequestTimeoutError` on heavier queries.
- `readOnly: true` → unchanged safe default; we never write to Tally.

> If the install already has a `config.json` with a `defaultCompany` /
> `defaultFinancialYear` you want to keep, just ADD the three `tally` keys
> (`assumedEdition`, `unsafeSlow`, `requestTimeoutMs`) rather than replacing
> the whole file.

---

## 4. Verification sequence (in Claude Desktop)

Run these one at a time; confirm each before the next:

1. **`Call the test_connection tool from tallymcp-pro and show me the raw result.`**
   → expect Tally reachable + a company name. (No `ERR_MODULE_NOT_FOUND` — that's the v1.0.5 fix confirmed.)
2. **`Call tally_get_capabilities.`**
   → expect `edition: "gold"`, `voucherQueriesViable: true`. If Silver → apply §3 safety-net.
3. **`List the active companies in Tally.`** (`tally_list_companies`)
4. **`Show me the Trial Balance for Q4 FY 2023-24.`** (`tally_trial_balance`)
5. **(optional)** P&L + Balance Sheet for the same period
6. **`Run audit-lite for Q4 FY 2023-24.`** (`tally_run_audit_lite`) — the big payoff

---

## 5. Capture fixtures (the reason this Gold session is gold)

We rarely get Gold-Tally access. Capturing the raw XML lets us fix #134 (edition
detection) and #136 (TB/P&L/BS over-gating) properly instead of guessing.

1. AnyDesk-transfer `capture-tally-fixtures.ps1` to the friend's machine
2. With TallyPrime open + company loaded, right-click the script → **Run with PowerShell**
   (or: `powershell -ExecutionPolicy Bypass -File capture-tally-fixtures.ps1`)
3. It POSTs 3 read-only envelopes to `127.0.0.1:9000` and saves the raw responses to a
   `tally-fixtures-<timestamp>` folder on the Desktop:
   - `1-list-companies.response.xml`
   - `2-edition-probe-trial-balance.response.xml` (+ a verdict line: would the probe say Gold or false-Silver?)
   - `3-ledgers-with-closingbalance.response.xml` (+ whether ClosingBalance came back — proves the #136 fix viability)
4. The script is strictly read-only (Export/Collection only — never Import/alter)
5. Zip the folder and send it back

These 3 responses tell us:
- **#134** — exactly what the friend's Gold gateway returns for the edition probe, and why the regex/timeout misfires
- **#136** — whether a Ledger master collection serves `ClosingBalance` cross-edition (if yes, TB/P&L/BS can be re-implemented as Collection+TDL projections that work on Silver too)

---

## 6. After the session

- [ ] Confirm the 6-step verification all passed (or note which step failed + the error)
- [ ] Retrieve the `tally-fixtures-*.zip`
- [ ] We use the fixtures to scope the real #134 + #136 fixes for v1.0.6
- [ ] Note whether the §3 safety-net was needed (tells us how urgent #134 is)
