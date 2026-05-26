# installer/

Phase 3 installer packaging — produces a single NSIS `.exe` for the v1.0
TallyMCP release. Drives `electron-builder` against the Phase 2
Configurator build output, bundles a portable `node.exe` and the
`mcp-server/` dist + production deps, signs with `signtool` when
CSC env vars are set.

## Layout

- `installer.nsh` — custom NSIS macros injected via electron-builder's
  `nsis.include`. Hooks `customUnInstall` to invoke
  `TallyMCP.exe --uninstall-cleanup` before file removal.
- `scripts/fetch-node.mjs` — downloads a pinned portable Node 20 LTS
  and caches it at `installer/staging/node.exe`.
- `scripts/deploy-mcp-server.mjs` — runs `pnpm deploy --filter
  @tallymcp/mcp-server --prod installer/staging/mcp-server` so the
  installer has a self-contained mcp-server tree with flat node_modules.
- `scripts/checksum.mjs` — writes a `.sha256` sidecar next to the
  built installer.
- `test/install-smoke.ps1` — runs the built installer headlessly and
  asserts the expected install layout.
- `test/uninstall-smoke.ps1` — runs the bundled uninstaller and asserts
  cleanup of install dir + AI client configs + firewall rule.
- `staging/` — gitignored; populated by the scripts above before
  electron-builder runs.

## Run

```powershell
pnpm package           # full build + bundle + electron-builder + checksum
pnpm package:install   # local smoke install
pnpm package:uninstall # local smoke uninstall
```

## Code signing

See `docs/v1-installer-phase3-signing-setup.md`. With `CSC_LINK` (path
to `.pfx`) and `CSC_KEY_PASSWORD` set, the build signs automatically.
Without them, the build emits an unsigned `.exe` and prints a warning.
