# v1 Release Procedure

How to cut a new release of TallyMCP. Assumes the Phase 4 secrets
(`CSC_LINK_BASE64`, `CSC_KEY_PASSWORD`) are configured per
`docs/v1-installer-phase4-secrets-setup.md`.

## 1. Pre-release checks

Run on the branch you're about to tag (usually `main`):

```bash
pnpm install
pnpm -r build
pnpm lint
pnpm -r test
pnpm --filter @tallymcp/configurator typecheck
pnpm --filter @tallymcp/configurator e2e
```

All four green = OK to release.

## 2. Bump version

Edit `apps/configurator/package.json` and bump the `version` field to
the target release (semver: `1.0.0` for stable, `1.0.0-beta.1` for
pre-release in a future phase). Then:

```bash
git add apps/configurator/package.json
git commit -m "chore: bump configurator version to 1.0.0"
git push
```

## 3. Tag + push

```bash
git tag v1.0.0
git push origin v1.0.0
```

Pushing the tag triggers `.github/workflows/release.yml`.

## 4. Watch the workflow

```bash
gh run watch --exit-status
```

Expected: ~6 minutes wall-clock. Steps in the run:
1. Checkout (~10 s)
2. Setup Corepack + Node + pnpm install (~60 s)
3. Build + lint + test + typecheck + e2e (~2 min)
4. Decode signing cert (~5 s)
5. `pnpm package` (~2–3 min — builds Electron, signs the .exe, runs checksum)
6. `generate-latest-json.mjs` (~1 s)
7. Upload to GitHub Release (~30 s)

If anything fails, see `docs/v1-installer-phase4-troubleshooting.md`.

## 5. Verify the release page

Open `https://github.com/vinaysaraf/tallymcp-pro/releases/tag/v1.0.0`.
Expected: 4 artifacts attached:
- `TallyMCP-Setup-v1.0.0.exe`
- `TallyMCP-Setup-v1.0.0.exe.sha256`
- `latest.yml`
- `latest.json`

## 6. Verify signature + sha256

Download `TallyMCP-Setup-v1.0.0.exe` + `TallyMCP-Setup-v1.0.0.exe.sha256`
to a Windows machine. In PowerShell:

```powershell
# Verify SHA-256.
$expected = (Get-Content TallyMCP-Setup-v1.0.0.exe.sha256).Split()[0]
$actual = (Get-FileHash TallyMCP-Setup-v1.0.0.exe -Algorithm SHA256).Hash.ToLower()
if ($expected -eq $actual) { "OK" } else { "FAIL: $expected != $actual" }

# Verify signature.
Get-AuthenticodeSignature TallyMCP-Setup-v1.0.0.exe | Format-List Status,SignerCertificate,TimeStamperCertificate
```

Both should be valid.

## 7. End-to-end smoke (optional but recommended)

If you have a v0.x installation on a Windows VM:
- Launch it → wait ~5–10 s → the UpdateBanner should appear with "TallyMCP v1.0.0 is available".
- Click "Update now" → progress bar runs → "Restart to apply" → click Restart → relaunched app shows v1.0.0 in Settings.

If you don't have a v0.x installation:
- Install the new `.exe` directly → verify it runs + tile grid renders + the Configurator polls Tally successfully.

## 8. Edit the release notes (optional)

The workflow creates the release with default notes ("Auto-generated").
Edit on the GitHub Release page to add a human-readable summary if
you want. The `latest.json.releaseNotesUrl` already points at the
release page, so the UpdateBanner's "What's new" link will open
whatever you write there.

## Re-running a failed release

If the workflow fails mid-way (e.g. signing failed, upload timed out):

1. Fix the underlying issue.
2. Either: delete the tag + re-push it (CI re-triggers automatically),
   OR use `workflow_dispatch` from the Actions tab with the existing tag.

```bash
git tag -d v1.0.0
git push --delete origin v1.0.0
git tag v1.0.0
git push origin v1.0.0
```
