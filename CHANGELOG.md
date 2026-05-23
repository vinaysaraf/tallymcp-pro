# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
