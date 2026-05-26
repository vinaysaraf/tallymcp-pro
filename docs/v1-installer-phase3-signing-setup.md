# Self-signed code signing for Phase 3 installer

Phase 3 ships with a free, self-signed code-signing cert. SmartScreen
will still show "Unknown publisher" on first run — the Configurator's
SmartScreenGuide popup (Phase 2) walks users through it. The point of
signing is so the SHA-256 of the binary is stable + GitHub Releases can
publish a verifiable artifact in Phase 4.

EV (Extended Validation) cert procurement is a separate business
decision deferred indefinitely.

## One-time cert generation (on your Windows dev machine)

1. Open **PowerShell as Administrator** (required for `New-SelfSignedCertificate`).

2. Generate the cert in the user's certificate store:

   ```powershell
   $cert = New-SelfSignedCertificate `
     -Subject "CN=Vinay Saraf" `
     -Type CodeSigningCert `
     -KeyUsage DigitalSignature `
     -FriendlyName "TallyMCP Code Signing" `
     -CertStoreLocation Cert:\CurrentUser\My `
     -NotAfter (Get-Date).AddYears(3) `
     -HashAlgorithm SHA256
   $cert.Thumbprint
   ```

   Save the thumbprint that prints — you'll need it to find the cert again.

3. Export the cert as a password-protected `.pfx`:

   ```powershell
   $pwd = Read-Host -Prompt "Cert password" -AsSecureString
   Export-PfxCertificate `
     -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
     -FilePath "$HOME\tallymcp-signing.pfx" `
     -Password $pwd
   ```

4. Store the `.pfx` somewhere safe (NOT in the repo — `.gitignore`
   ignores `*.pfx` already). Common spot: `%USERPROFILE%\.tallymcp\`.

## Local signed builds

Set the env vars before running `pnpm package`:

```powershell
$env:CSC_LINK = "$HOME\tallymcp-signing.pfx"
$env:CSC_KEY_PASSWORD = "<your-password>"
pnpm package
```

electron-builder picks up these vars automatically and signs the `.exe`
with `signtool` (which it locates in the Windows SDK). The signing
timestamp uses DigiCert's free timestamp server
(`http://timestamp.digicert.com`).

Verify the signature:

```powershell
$exe = "apps\configurator\dist-installer\TallyMCP-Setup-v0.0.1.exe"
Get-AuthenticodeSignature $exe | Format-List Status,SignerCertificate,TimeStamperCertificate
```

Expected: `Status: Valid`, signer matches your `New-SelfSignedCertificate`
subject, timestamp populated.

## Preparing for Phase 4 (GitHub Actions)

Phase 4 will sign on `windows-latest` runners. To prepare:

1. Base64-encode the `.pfx`:

   ```powershell
   $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\tallymcp-signing.pfx"))
   $b64 | Set-Clipboard
   ```

2. In the GitHub repo settings → Secrets and variables → Actions, add:
   - `CSC_LINK_BASE64` = the base64 string from clipboard.
   - `CSC_KEY_PASSWORD` = the password used in step 3 of cert generation.

3. Phase 4's `release.yml` workflow will decode `CSC_LINK_BASE64` to a
   temp `.pfx` and set `CSC_LINK` to that path.

## Unsigned fallback

If `CSC_LINK` is unset, `pnpm package` still produces a working `.exe` —
it's just unsigned. Use this for:

- Local dev builds where you don't want to type the password every time.
- CI environments without the signing secret (Phase 3 only; Phase 4 will
  require signing for tagged releases).

The unsigned warning in the build output is the expected behavior.

## Revocation

If the `.pfx` is ever leaked:

```powershell
$cert = Get-ChildItem Cert:\CurrentUser\My\<thumbprint>
Remove-Item $cert.PSPath
```

Then re-run the cert generation steps with a new key. All previously
signed installers remain valid until the cert's `NotAfter` date (3 years
from generation by default).
