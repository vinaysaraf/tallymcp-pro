# TallyMCP Pro

A production-grade, **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server that connects **TallyPrime** to AI tools (Claude Desktop, Cursor, LM Studio, Ollama).

It exposes Tally accounting data — reports, masters, vouchers — as MCP tools and
generates CA-grade Excel workbooks, without ever writing back to Tally.

## Status

**Phase 0 (bootstrap)** complete. **Phase 1** in progress — the `@tallymcp/tally-xml`
export-envelope builder and XML response parser are done; the report engine is next.

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

© XLURSELF India Pvt Ltd. All rights reserved.
