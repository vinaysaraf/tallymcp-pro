# Phase 4 GitHub Secrets Setup

One-time setup for the release pipeline. Assumes you've already
generated the self-signed `.pfx` per
`docs/v1-installer-phase3-signing-setup.md`.

## Required secrets

| Name | Value | How to populate |
|---|---|---|
| `CSC_LINK_BASE64` | Base64-encoded `.pfx` | See "Encoding the .pfx" below |
| `CSC_KEY_PASSWORD` | The password used when exporting the .pfx | Same string you typed during `Export-PfxCertificate` |

## Encoding the .pfx

On your Windows dev machine, in PowerShell:

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\tallymcp-signing.pfx"))
$b64 | Set-Clipboard
```

The base64 string is now on your clipboard.

## Adding to GitHub

1. Open https://github.com/vinaysaraf/tallymcp-pro/settings/secrets/actions.
2. Click "New repository secret".
3. Name: `CSC_LINK_BASE64`. Secret: paste from clipboard. Add.
4. Click "New repository secret" again.
5. Name: `CSC_KEY_PASSWORD`. Secret: the cert password (NOT the base64).
   Add.

## Verifying

The first time you push a `v*.*.*` tag, watch the workflow's "Decode
signing cert" step. If it prints `::error::CSC_LINK_BASE64 secret is
empty or missing` or `::error::decoded .pfx is empty`, the secret is
either missing or was pasted wrong (e.g. with surrounding whitespace).

Re-do the encoding step, replacing the secret value.

## Rolling the cert

If the cert needs to be replaced (leaked, expired, want to upgrade to
a real EV cert):

1. Generate the new cert + .pfx per
   `docs/v1-installer-phase3-signing-setup.md`.
2. Encode the new .pfx (see "Encoding the .pfx" above).
3. Edit the `CSC_LINK_BASE64` secret — paste the new base64.
4. Update `CSC_KEY_PASSWORD` if it changed.
5. Old signed installers remain valid until the OLD cert's `NotAfter`.

## Why the secret is base64

GitHub Secrets are strings; we can't store a binary `.pfx` directly.
Base64 round-trips the bytes through the string-only secret store.
electron-builder reads `CSC_LINK` as a file path (not a base64 blob),
so the workflow decodes the secret to a temp file before passing
`CSC_LINK=<path>` as an env var.
