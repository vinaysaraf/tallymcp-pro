# Phase 4 Manual Smoke — End-to-End Release + Auto-Update

Walks through cutting a test release + verifying the auto-update
flow on a real Windows machine. Aimed at the FIRST tag push for
v1.0.0; subsequent releases follow `v1-installer-phase4-release-procedure.md`
verbatim.

## Prerequisites

- Phase 4 secrets configured (`docs/v1-installer-phase4-secrets-setup.md`).
- A previous-version installation of TallyMCP on a Windows VM (for
  the auto-update verification step). If you don't have one, install
  the current `v0.0.1` build first, then proceed.

## 1. Bump version + tag + push

```bash
# On main
git pull
# Edit apps/configurator/package.json: "version": "0.0.1" → "1.0.0"
git add apps/configurator/package.json
git commit -m "chore: bump configurator version to 1.0.0"
git push

git tag v1.0.0
git push origin v1.0.0
```

## 2. Watch the workflow

```bash
gh run watch --exit-status
```

Expected: ~6 minutes. Green at the end. If red, see
`docs/v1-installer-phase4-troubleshooting.md`.

## 3. Verify the release page

Open `https://github.com/vinaysaraf/tallymcp-pro/releases/tag/v1.0.0`.

Expected: 4 artifacts attached:
- `TallyMCP-Setup-v1.0.0.exe`
- `TallyMCP-Setup-v1.0.0.exe.sha256`
- `latest.yml` (electron-updater feed)
- `latest.json` (spec Appendix C)

## 4. Verify signature on a downloaded .exe

On your Windows machine:

```powershell
# Download the .exe + .sha256 from the release page.
$expected = (Get-Content TallyMCP-Setup-v1.0.0.exe.sha256).Split()[0]
$actual = (Get-FileHash TallyMCP-Setup-v1.0.0.exe -Algorithm SHA256).Hash.ToLower()
$expected -eq $actual  # → True

Get-AuthenticodeSignature TallyMCP-Setup-v1.0.0.exe | Format-List Status, SignerCertificate
# Status: Valid
# SignerCertificate: CN=TallyMCP Pro (self-signed)
```

## 5. Verify auto-update on an existing v0.x install

Launch the previously-installed `v0.0.1` Configurator.
Wait ~5–10 seconds (the main process triggers an initial
checkForUpdates 5s after window open).

Expected:
- A blue `UpdateBanner` appears above the status banner: **"↑ TallyMCP v1.0.0 is available (you're on v0.0.1). [Update now] [What's new] [Later]"**.

### 5a. Click "What's new"
- External browser opens to `https://github.com/vinaysaraf/tallymcp-pro/releases/tag/v1.0.0`.

### 5b. Click "Update now"
- Banner switches to **"↓ Downloading TallyMCP v1.0.0…"** with a progress bar.
- Progress reaches 100%.
- Banner switches to **"✓ Restart to apply TallyMCP v1.0.0. [Restart now]"** (green).

### 5c. Click "Restart now"
- App quits.
- electron-updater runs the new installer.
- App relaunches.
- Settings shows version `1.0.0` (was `0.0.1`).

## 6. Verify "Later" works on a fresh install

Install the v1.0.0 `.exe` on a clean Windows VM (no prior TallyMCP).
Tag a new test release v1.0.1 (just for this test — bump version
to 1.0.1, push tag, wait for workflow). Then on the v1.0.0 VM:

- Wait ~5–10 s after launch.
- Banner appears with "↑ TallyMCP v1.0.1 is available".
- Click **"Later"**.
- Banner disappears.
- Restart the app → banner reappears (Later is session-only, not
  permanent).

## 7. Verify the workflow_dispatch path

In the GitHub Actions UI, manually trigger `Release` workflow on
the v1.0.0 tag (NOT a new tag — same one). Expected: workflow
succeeds, but the upload step is a no-op (artifacts already exist
on the release). `softprops/action-gh-release@v2` is idempotent
by default. This validates the rerun pattern in the troubleshooting
guide.

## 8. Known Phase 4 limitations

- **Cancel button is grayed during file extraction** — this is normal NSIS
  Modern UI 2 behavior on the `MUI_PAGE_INSTFILES` page. Back/Next are
  disabled until extraction completes (then Next becomes "Finish"); Cancel
  stays disabled until the next page transitions. If you need to abort
  mid-install, close the wizard window (which triggers Tally's standard
  "cancel?" dialog), or kill the `TallyMCP-Setup-vX.Y.Z.exe` process via
  Task Manager.

- **Self-signed cert SmartScreen warning** — same as Phase 3; users
  click "More info → Run anyway" on the first install. Phase 5
  upgrades to a real EV cert.
- **No delta updates** — electron-updater downloads the full `.exe`
  every time. Acceptable for a ~150 MB Electron app; revisit if
  the installer grows.
- **No staged rollouts** — every tag goes to every installation
  immediately. Phase 5+ could add a `latest-canary.yml` channel.
- **No telemetry on update acceptance rate** — we don't know how
  many users click "Update now" vs "Later" vs dismiss. Spec §10
  defers this; opt-in telemetry is a v1.1+ item.
