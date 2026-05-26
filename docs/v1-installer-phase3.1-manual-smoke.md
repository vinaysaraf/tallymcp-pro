# Phase 3.1 Manual Smoke — Admin/Elevation UX

Walks through all 4 patches on a Windows machine. Best run on a
non-admin account so the elevation paths fire naturally. If you only
have an admin account, you can simulate by intentionally locking
permissions on `tally.ini` (described in §3 below).

## 1. Build + install the latest Configurator

```powershell
cd "C:\Projects\Tally MCP"
pnpm install
pnpm package
```

Install the produced `apps/configurator/dist-installer/TallyMCP-Setup-vX.Y.Z.exe`
on a non-admin Windows account (or open it from a regular user shell).

## 2. Verify the admin pre-flight badge (Patch C)

- Launch the Configurator from the Start Menu.
- Open Tally, load a company.
- Click **Health Check** in the nav.
- If the firewall rule is missing AND you're non-admin:
  - The Fix button reads **"Fix both (Admin needed) →"** (not the plain "Fix both, continue →").
  - Above the button there's a small hint: *"💡 Right-click TallyMCP → Run as administrator, OR follow the manual steps after clicking Fix."*

If you're running as admin: the button reads "Fix both, continue →" and no hint appears. (You can verify by relaunching the Configurator via right-click → Run as administrator.)

## 3. Verify the tally.ini locked error message (Patch B)

Make `tally.ini` non-writable for the test:

```powershell
$ini = "C:\Program Files\TallyPrime\tally.ini"
# Open Tally first so the file is locked, OR remove your user's write access:
icacls $ini /deny "$env:USERNAME:(W)"
```

- In the Configurator's Health Check screen, click **Fix both** (it'll be "Fix both (Admin needed)" on non-admin).
- Expected: a red `ErrorBanner` appears with: *"Couldn't edit tally.ini at C:\Program Files\TallyPrime\tally.ini. This usually means TallyPrime is currently running — close it from the system tray, then click Fix again. If that doesn't help, your user account may not have write access to that folder; ask your IT team for write access, or run TallyMCP as Administrator. (Underlying error: EPERM ...)"*
- Verify the message is the SAME wherever you might see it (no raw `EPERM:` text).

Cleanup:

```powershell
icacls $ini /remove:d $env:USERNAME
```

## 4. Verify the firewall-skipped-non-admin yellow card (Patch A)

This requires running the Configurator as a non-admin user (or on a machine where netsh's firewall add returns the "elevation" signature). Most CA dev machines fit this case.

- Ensure `tally.ini` is restored (no permission deny).
- Ensure the firewall rule "TallyMCP — Tally XML port 9000" doesn't exist:
  ```powershell
  netsh advfirewall firewall delete rule name="TallyMCP — Tally XML port 9000"
  ```
- In the Configurator's Health Check, click **Fix both (Admin needed)**.
- Expected after the click:
  - The Health Check refreshes — XML interface line shows green (still applied).
  - Firewall line still shows yellow "missing".
  - **NEW: a yellow card appears below the status list**: *"⚠ Couldn't add the firewall rule. **Admin rights required**, or your IT policy may block it. The XML interface change DID apply — that part worked. AI tools on this same PC still work over loopback (most CA setups). The firewall rule is only needed for multi-machine setups (Tally on PC-A, AI tool on PC-B)."*

## 5. Verify the IT-policy guidance modal (Patch D)

This is harder to trigger naturally — Group Policy blocking firewall changes is a corporate-managed Windows feature. To simulate:

```powershell
# Open the Local Group Policy Editor (gpedit.msc — only on Pro/Enterprise Windows).
# Navigate to: Computer Configuration → Administrative Templates → Network →
#   Network Connections → Windows Defender Firewall → Domain Profile
#   (or Standard Profile depending on your network type).
# Enable: "Windows Defender Firewall: Do not allow exceptions"
```

After enabling, `netsh advfirewall firewall add rule` will return a stderr containing "Group Policy" — our library throws `GroupPolicyError`, `TallyAutofixer.ensureFirewallRule` returns `"group-policy-blocked"`, and the App.tsx handler opens the `ITPolicyHelpModal`.

- In the Configurator, click **Fix both**.
- Expected: a modal opens titled **"Your IT policy blocks firewall changes — here are your options"**.
- It shows:
  - A green box: "✓ Most likely you can skip this entirely" with the loopback-only explanation.
  - A `netsh` code block with the exact command for IT.
  - A PowerShell `New-NetFirewallRule` code block (functionally equivalent).
  - A "Got it" button that closes the modal.

Cleanup the Group Policy override:

```powershell
# In gpedit.msc, set "Windows Defender Firewall: Do not allow exceptions" back to "Not configured".
```

## 6. Sanity gates

```powershell
pnpm -r build
pnpm lint
pnpm -r test
pnpm --filter @tallymcp/configurator typecheck
pnpm --filter @tallymcp/configurator e2e
```

All five should be green. Tally-autofix: **52** tests (44 baseline + 8 net new; includes the defensive exit-code test added during Task 1 code review). Configurator: **90 unit** + 4 E2E.

## 7. Known Phase 3.1 limitations

- **No auto-elevation** — the user has to manually right-click → Run as administrator. We don't ship a `requestedExecutionLevel` manifest because that conflicts with electron-builder NSIS user-mode install.
- **Manual gpedit simulation** for Patch D — there's no easy way to test the Group Policy path on a non-corporate dev machine. Real users in corporate environments will hit it naturally.
- **No telemetry** — we don't track how often each patch fires. If post-release support load suggests we should (e.g., many CAs hit Patch A), add anonymous opt-in telemetry in a v1.1 patch.
- **English-only Group Policy detection** — the netsh stderr regex `/group policy/i` only matches English Windows. Hindi/Tamil/Bengali Windows would fall through to ErrorBanner with raw stderr. v1.1 polish item.
- **CLI hotfix shipped alongside** — `apps/cli/src/main.ts` gained an explicit `"group-policy-blocked"` branch with IT-policy guidance (was silently printing `✓ Firewall rule: group-policy-blocked` before). Cursor caught this during Task 4 code review.
