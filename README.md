# TallyMCP Pro

A production-grade, **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server that connects **TallyPrime** to AI tools (Claude Desktop, Cursor, LM Studio, Ollama).

It exposes Tally accounting data — reports, masters, vouchers — as MCP tools and
generates CA-grade Excel workbooks, without ever writing back to Tally.

## Download

**[⬇ Download the latest Windows installer](https://github.com/vinaysaraf/tallymcp-pro/releases/latest)**

Grab `TallyMCP-Setup-v<version>.exe` from the latest release and double-click to
install. The bundled **Configurator** installs the MCP server and wires it into
your AI client (Claude Desktop, Cursor, LM Studio, Ollama) for you — no manual
config editing.

**Minimum requirements**

- **Windows 10 or 11** (64-bit)
- **TallyPrime 4.x**, running with a company loaded and the XML interface enabled
  on port **9000** (Gateway of Tally → F1 Help → Settings → Connectivity →
  Client/Server configuration → set to *Both*)

**Windows SmartScreen note.** The installer is **not yet code-signed**, so Windows
SmartScreen may warn *"Windows protected your PC."* — this is expected for a new
open-source publisher, not a sign of malware. Click **More info → Run anyway**.
(A code-signing certificate is a planned improvement — tracked in
[issue #17](https://github.com/vinaysaraf/tallymcp-pro/issues/17).)

**Verify your download (recommended).** Every release publishes a SHA-256 for each
asset — in the release notes, in `checksums.txt`, and in
`TallyMCP-Setup-v<version>.exe.sha256`. After downloading, confirm the hash matches:

```powershell
Get-FileHash .\TallyMCP-Setup-v<version>.exe -Algorithm SHA256
```

If the printed hash matches the value in the release notes, the download is intact
and untampered. If it does **not** match, delete the file and download again.

## Status

**Read-only MCP server — feature complete.** The stdio MCP server is live with:

- 19 MCP tools — reads across 10 report types, Excel/JSON/CSV exports, masters &
  voucher export, ledger/group closing balances, audit-lite, dashboards, a
  capabilities probe, and config
- 6 prompts and 4 resources for guided AI flows
- 18 rule-based audit-lite checks + explainable 0–100 books score
- 3 Excel dashboards (Management Snapshot, Sales Trend, Exceptions Overview)
- Network guard restricting egress to the configured Tally host

## Prerequisites

- **Windows 10/11** with **TallyPrime 4.x** (TallyPrime runs only on Windows)
- **Node.js 20 LTS**
- **pnpm 9+** — `npm install -g pnpm`

See `docs/windows-dev-setup.md` for the full Windows setup.

## Quick start

```powershell
pnpm install
pnpm build
pnpm test
pnpm hello-tally
```

TallyPrime must be running with a **company loaded** and the XML interface enabled
on port **9000** (Gateway of Tally → F1 Help → Settings → Connectivity →
Client/Server configuration → set to *Both*).

> TallyPrime does not run on macOS. macOS can be used for offline development only —
> see `docs/mac-dev-setup.md`.

## Monorepo layout

```text
apps/
  mcp-server/        MCP stdio server
  cli/               command-line connection test and read

packages/
  tally-connector/   HTTP client, request serializer, diagnostics
  tally-xml/         envelope builders, response parser, amount/escape helpers
  shared-types/      Zod schemas and domain types
  report-engine/     report orchestration and normalization
  analytics-engine/  rule-based audit-lite checks
  excel-engine/      Excel workbook generation
  config-store/      Zod-validated configuration
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all Vitest suites |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | TypeScript checks |
| `pnpm hello-tally` | Smoke-test a live Tally connection |
| `pnpm diagnose-tally` | Diagnose connection problems |
| `pnpm read-report --report TrialBalance --company "..."` | Run any report against a live Tally |

## Wiring to an AI client

After `pnpm build`, the MCP server entry (for local dev) is
`apps/mcp-server/dist/main.js`. In an **installed** TallyMCP (from the NSIS
`.exe`), the entry is the bundled `<installDir>\mcp-server\main.bundle.js`
(single esbuild bundle, no node_modules — v1.0.5+); the Configurator wires
that path for you. To connect manually from **Claude Desktop** or **Cursor**
in a dev checkout, add an entry like:

```json
{
  "mcpServers": {
    "tallymcp-pro": {
      "command": "node",
      "args": ["C:/Projects/Tally MCP/apps/mcp-server/dist/main.js"],
      "env": {
        "TALLYMCP_CONFIG": "C:/Users/YOU/.tallymcp/config.json"
      }
    }
  }
}
```

…or call `tally_export_mcp_config` from inside the running server and paste
its output. Available clients: `cursor`, `claude-desktop`, `lm-studio`, `ollama`.

The first launch creates `config.json` with safe defaults
(`security.readOnly: true`, local Tally at `127.0.0.1:9000`).

## Documentation

| Document | Purpose |
|---|---|
| `docs/windows-dev-setup.md` | Windows dev environment |
| `docs/mac-dev-setup.md` | macOS (offline development only) |
| `docs/tally-xml-notes.md` | Tally XML protocol quirks |
| `docs/definition-of-done.md` | Per-milestone quality bar |
| `.cursor/rules/` | Cursor agent rules (product, TypeScript, Excel) |
| `CHANGELOG.md` | Release notes |

## Contributing

Issues and pull requests are welcome. Every change must pass `pnpm build`,
`pnpm test`, `pnpm lint`, and `pnpm typecheck`, and satisfy `docs/definition-of-done.md`.

## License

Licensed under the **[MIT License](./LICENSE)** — free to use, copy, modify, and
distribute, including for commercial purposes, with attribution.

Developed by **Vinay Saraf (CA)** as the Capstone Project for **ICAI AI Level
Batch 2**.

More open-source finance tools by XLURSELF: https://www.xlurself.com/open-source

Copyright © 2026 Vinay Saraf.
