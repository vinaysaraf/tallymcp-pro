# Changelog

All notable changes to this project will be documented in this file.

## v1.0.0-phase1 — Installer foundation (2026-05-25)

### Added
- **`@tallymcp/client-wirer`** package — atomic JSON merge / backup / remove for the 5 supported AI clients (Claude Desktop, Cursor, Claude Code, LM Studio, Ollama).
- **`@tallymcp/tally-autofix`** package — `tally.ini` parser/editor that preserves order and comments, Windows Firewall rule manager via `netsh`, Tally process detection.
- **`@tallymcp/cli`** app exposing 4 commands:
  - `tallymcp-cli wire <client>` — adds TallyMCP to the named AI client's config.
  - `tallymcp-cli unwire <client>` — surgically removes our entry.
  - `tallymcp-cli tally-fix` — turns on Tally's XML interface and adds the firewall rule.
  - `tallymcp-cli tally-restore` — restores `tally.ini` from backup and removes the firewall rule.
- `claude-code` added to `apps/mcp-server/src/client-config.ts` SupportedClient list so the runtime config-export tool stays in sync with the installer.

### Notes
- Phase 1 ships only the data-layer libraries and a terminal CLI. The Electron Configurator UI lands in Phase 2.
- JSON config files written by `client-wirer` are formatted with `JSON.stringify(merged, null, 2)`; whitespace and key order may differ from the original. The `.bak` siblings preserve the pre-edit file byte-for-byte for restore.

### Preview-and-confirm UX for CLI commands (Phase 1 addendum)

All 4 CLI commands now print an explicit preview of every file change they will make before modifying anything on disk.  The user must type `y` or `yes` to proceed; any other input (including empty) aborts with exit code 1.

**`-y` / `--yes` flag** — skips the interactive prompt entirely. Intended for scripted environments and for the Phase 2 Configurator UI (which has its own visual consent surface and will pass `--yes` when invoking the CLI).

Behavior summary per command:

| Command | Preview shows | Reversible with |
|---|---|---|
| `wire <client>` | config file path + JSON entry that will be added + backup path | `unwire <client>` |
| `unwire <client>` | config file path + key that will be removed | — |
| `tally-fix` | `tally.ini` path + 2 lines that will be added + firewall rule details | `tally-restore` |
| `tally-restore` | `tally.ini` + backup path that will be restored + firewall rule that will be deleted | — |

The abort path throws an `AbortError` (exported from `apps/cli/src/confirm.ts`); `main.ts` catches it, logs `"Aborted."`, and exits with code 1.  Tests inject a `confirmFn` stub rather than reading from stdin.

### Changed (post-smoke fixes)
- `tally-fix` now skips the Windows Firewall step gracefully when not run as
  Administrator, instead of failing. The `tally.ini` edit still proceeds.
  Most CAs run TallyMCP entirely on loopback (`127.0.0.1:9000`), which does
  not require the firewall rule. Power users with multi-machine setups can
  re-run from an elevated terminal to add it.
- `client-wirer` strips UTF-8 BOM before `JSON.parse` (PowerShell-generated
  config files frequently have one).

## [Unreleased]

### Added

- **v0.7.0 — TDL engine kill-switch:**
  - New `@tallymcp/tdl-engine` package: nunjucks renderer + angular-bracket parameter substitution + F01..Fn row parser + `runTdlReport` orchestrator. Templates are data (`packages/tdl-engine/templates/*.xml` + `report-catalog.json`). 32 Vitest tests.
  - `TallyHttpClient` switched to **UTF-16 LE transport** by default, with per-call `charset?: "utf-16" | "utf-8"` override so legacy UTF-8 envelopes keep working during the migration.
  - `trial-balance.xml` shipped as the first inline-TDL template: `REPORT + FORM + PART + LINE + FIELDs + COLLECTION` over `<TYPE>Ledger</TYPE>` projecting Name / Parent / Opening / Debit / Credit / Closing as F01..F06.
  - `getTrialBalance` connector rewired to delegate through `tdl-engine` while preserving its `TrialBalanceRow[]` return contract. Existing legacy connectors (P&L, BS, masters, day-book, sales, ledger-balance) explicitly request `charset: "utf-8"` until they migrate to TDL in v0.7.1+.
  - C-R1 enforcement: CI test (`packages/tdl-engine/test/c-r1-grep.test.ts`) refuses any template containing Import / Alter / Create / Delete / `MASTER ID` directives.
  - Live proof script: `pnpm v070-tb-proof`. Results captured in `docs/live-tally-checklist.md`.
  - 256 tests passing across all 10 packages.

- **S3 + S4** — `@tallymcp/mcp-server`: stdio MCP server exposing 15 tools (connection, companies, 10 reports, masters/vouchers/dashboard/audit-lite exports, config), 6 prompts (`config`/`read`/`export`/`audit`/`dashboard`/`help`), and 3 resources (`tally://companies`, `tally://docs/connection-guide`, `tally://audit/last`). Network guard restricts egress to the configured Tally host:port (C-R3). Snippet generator emits MCP client config for Claude Desktop, Cursor, LM Studio, and Ollama. 14 Vitest tests including in-process client/server integration.
- **S4 analytics-engine** — `@tallymcp/analytics-engine`: 18 audit-lite check functions (ledger hygiene, GST/PAN format, voucher narrations, duplicate numbers, round-figure / large-journal / backdated, cash negative, suspense balance), `runAuditLite` orchestrator, explainable `computeBooksScore` (0–100), `toAuditWorkbook` Excel renderer, and 3 dashboard builders (ManagementSnapshot, SalesTrend, ExceptionsOverview); 8 Vitest tests including full-sweep and clean-fixture sanity.
- `@tallymcp/shared-types`: `BooksScore`, `BooksScoreComponent`, `AuditLiteSummary`, `AuditLiteResult` schemas
- **S2.2** — `@tallymcp/output-store`: new package wiring `report-engine` + `excel-engine`. `exportReport` (xlsx or json), `exportMasters` (multi-sheet xlsx + per-master CSVs), `exportVouchers` (streaming CSV via new `getDayBookStream`, UTF-8 BOM, RFC-4180 quoting). `GeneratedFile` metadata; safe filename/dir helpers; 8 Vitest tests
- **S2.1** — `@tallymcp/excel-engine`: declarative `WorkbookSpec`/`SheetSpec`/`ColumnSpec` (Zod); `renderWorkbook` via ExcelJS producing `.xlsx` Buffers; Indian currency format presets (`#,##,##0.00`); cover sheet, extraction log, freeze panes, auto-filter; per-report `toWorkbookSpec` adapter covering all 10 in-scope reports; 24 Vitest tests including round-trip per report
- `@tallymcp/shared-types`: `GeneratedFile` + Zod schema. `@tallymcp/report-engine`: `getDayBookStream` async iterable for memory-safe voucher export
- **S1.4** — `@tallymcp/config-store`: `ConfigSchema` (TallyConnection, FinancialYear, `security.readOnly` defaults true per C-R2, `output.folder`, `defaultCompany`, `defaultFinancialYear`); `ConfigStore` with on-disk JSON + Zod validation, in-memory cache, deep-merge `update()`, and `schemaVersion` migration stub; 17 Vitest tests
- **S1.3** — `@tallymcp/report-engine`: 10 report connectors (companies, company-info, ledgers, groups, voucher-types, day-book, trial-balance, P&L, balance-sheet, sales-register); `resolvePeriod` (Indian FY defaulting from `Company.startingFrom`); 7-day chunked Day Book reader; `runReport` dispatcher (Zod-validated request, typed `ReadReportResult`); `TallyReportError` for soft `<LINEERROR>` responses; 48 Vitest tests, **89.8 %** package coverage; `scripts/read-report.ts` live-test CLI
- **`@tallymcp/shared-types`** extensions: `VoucherLine`, `Voucher` (with `party`/`reference`/`entries`), `TrialBalanceRow`, `PnlRow`, `BalanceSheetRow`, `ReportId` enum, `ReadReportRequest`, `ReadReportResult`, `ReportStatus`, `ReportMeta`, `Finding`, `FindingSeverity`; 22 new Vitest tests
- **S1.2** — `@tallymcp/tally-xml` XML response parser: `parseTallyResponse` (fast-xml-parser, UTF-8/entity-safe, no-prolog tolerant), `walk`/`findAll` tree helpers, `extractLineErrors`, `parseTallyAmount` (Indian lakh grouping + Cr/Dr), `parseTallyBoolean`; `TallyXmlError`/`TallyAmountParseError`; 45 Vitest tests; `@vitest/coverage-v8` added for the coverage gate
- **S1.1** — `@tallymcp/tally-xml` Export Data envelope builder: `buildExportEnvelope` + 10 per-report envelope helpers (List of Companies, Company Info, Ledgers, Groups, Voucher Types, Day Book, Trial Balance, P&L, Balance Sheet, Sales Register); UTF-8 export vars and XML escaping on every envelope; 17 Vitest tests

### Changed

- Repository scoped to source code and developer docs; internal business-requirements and implementation-plan documents are maintained privately.

## [0.0.1] — 2026-05-21

### Added

- Phase 0 monorepo bootstrap (pnpm workspace, TypeScript strict, ESLint, Prettier, Vitest, CI)
- `@tallymcp/shared-types` — core Zod domain schemas
- `@tallymcp/tally-xml` — XML escape/date helpers with tests
- `@tallymcp/tally-connector` — Tally HTTP client, request serializer, diagnostics
- Tally XML sample fixtures and `scripts/hello-tally.ts`
