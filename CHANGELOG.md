# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
