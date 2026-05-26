# Phase 4 Release Troubleshooting

Common failure modes when running the release workflow + how to fix.

## "Decode signing cert" step fails

### `CSC_LINK_BASE64 secret is empty or missing`
- Secret isn't configured. See `docs/v1-installer-phase4-secrets-setup.md`.

### `decoded .pfx is empty`
- Secret value was pasted with surrounding whitespace OR is corrupted.
- Re-encode the .pfx + replace the secret value (no leading/trailing
  spaces, no quotes).

## `pnpm package` fails with "signtool: cert file not found"
- electron-builder couldn't find the file at `CSC_LINK`. The decode
  step should have set this; verify the previous step succeeded.
- Check `RUNNER_TEMP` is set (it should be on `windows-latest`).

## `pnpm package` fails with "SignerSign() failed: Bad password"
- `CSC_KEY_PASSWORD` doesn't match the password used during
  `Export-PfxCertificate`. Re-check the secret value.

## `pnpm package` fails with "splitVendorChunk is not exported from vite"
- electron-vite version mismatch with Vite. Phase 3 fixed this by
  upgrading to electron-vite v4. If you see this in Phase 4, someone
  downgraded the dep. Check `apps/configurator/package.json`.

## `actions/checkout@v4` HTTP 403 / "packfile" errors
- Transient GitHub infrastructure issue. Check
  https://www.githubstatus.com. If `minor` or higher status, wait +
  re-run. Phase 3 hit this during the 2026-05-26 incident.

## `pnpm/action-setup@v4` fetch fails from `codeload.github.com`
- Another transient. Phase 3 already mitigated this by switching the
  PR-trigger CI (`.github/workflows/ci.yml`) to `corepack enable`.
  The release workflow uses the same pattern. If it fails anyway,
  wait + re-run.

## Upload step fails with "tag not found"
- The push event fired but the tag isn't visible to the workflow. This
  can happen when pushing the tag + the commit it points at in
  separate operations. Fix: push the commit first, then the tag, then
  let the workflow re-trigger.

## `latest.json` has wrong `version`
- `apps/configurator/package.json` `version` field wasn't bumped
  before tagging. Bump it + push a new tag.

## Update banner doesn't appear on installed Configurator
- Verify the release page has `latest.yml` (not just `.json` — that's
  for the landing page; electron-updater needs `latest.yml`).
- Verify electron-builder's `publish:` config in
  `apps/configurator/electron-builder.yml` matches the GitHub repo
  coordinates (owner + repo).
- Check the Configurator's console output (open the bundled DevTools
  if it's a debug build, or read the log file at
  `%LOCALAPPDATA%\Programs\TallyMCP\logs\`).

## Release was published but the .exe isn't signed

Run on the downloaded .exe:

```powershell
Get-AuthenticodeSignature TallyMCP-Setup-vX.Y.Z.exe | Format-List Status,SignerCertificate
```

If `Status: NotSigned`:
- The `Decode signing cert` step probably failed silently. Check the
  workflow logs.
- electron-builder might not have honored `CSC_LINK`. Check the
  build step's logs for "skipping code signing".
