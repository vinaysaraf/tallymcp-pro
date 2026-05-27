# Speeding up TallyMCP install on Windows Defender / your antivirus

If your TallyMCP install takes more than 2 minutes, your antivirus is
likely scanning each extracted file. TallyMCP ships ~175 MB of signed
binary + ~600 small files under `mcp-server/node_modules/` — Defender's
real-time scan can extend a 60-second extract to 5-15 minutes on slow
disks.

## Optional one-time fix (Windows Defender)

1. Open **Settings → Privacy & security → Windows Security**
2. Click **Virus & threat protection** → **Manage settings**
3. Scroll to **Exclusions** → **Add or remove exclusions** → **Add an exclusion → Folder**
4. Add: `%LOCALAPPDATA%\Programs\TallyMCP`
5. Restart the install. Should now complete in ~30-60 seconds.

## Optional one-time fix (other antivirus)

Most AV products have a similar "Exclusions" or "Whitelist" UI. The exact
path varies:

| Antivirus | Where to add the exclusion |
|---|---|
| Bitdefender | Settings → Antivirus → Exceptions → File or Folder |
| Norton | Settings → Antivirus → Scans and Risks → Exclusions / Low Risks |
| McAfee | Real-Time Scanning settings → Excluded files |
| Kaspersky | Settings → Threats and Exclusions → Manage exclusions |
| Sophos | Settings → Configure exclusions → Files/Folders |
| Quick Heal | Settings → Files & Folders Exclusion |

Add the same folder: `%LOCALAPPDATA%\Programs\TallyMCP\`

## Why this is safe

- TallyMCP is a code-signed Windows binary (signed via electron-builder's
  signtool integration in our GitHub Actions release pipeline).
- Source is fully open at https://github.com/vinaysaraf/tallymcp-pro.
- The exclusion only affects scanning of files INSIDE the TallyMCP install
  folder, not the rest of your system or downloads.
- Other files in `%LOCALAPPDATA%` continue to be scanned normally.

## For managed Windows (corporate IT)

If your machine is part of a corporate domain and AV settings are
controlled by Group Policy:

1. Contact your IT helpdesk.
2. Request: a folder-scoped exclusion for `%LOCALAPPDATA%\Programs\TallyMCP\`
   on managed AV (path is per-user; affects only your account).
3. Cite reason: legitimate productivity tool, internal use, signed binary.

If IT can't approve the exclusion, the install will still work — just
slowly. After the one-time install, daily MCP usage doesn't trigger AV
scans (the .exe doesn't change until the next update).

## Diagnostic — verify your AV product

PowerShell:

```powershell
# Windows Defender (default Windows AV)
Get-MpComputerStatus -ErrorAction SilentlyContinue | Select-Object AMProductVersion, AntivirusEnabled, RealTimeProtectionEnabled

# Any AV that registers with Windows Security Center (most consumer AVs)
Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | Select-Object displayName, productState
```

If both return nothing, ask your IT team or check Settings → Privacy &
security → Windows Security → Open Windows Security to see what's installed.
