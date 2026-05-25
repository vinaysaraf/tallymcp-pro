# Cursor review — v1.0 installer Phase 1 (re-review after fix commits)

**Date:** 2026-05-25  
**Branch:** `feat/v1.0-installer-phase1`  
**Tip SHA:** `29813d7`  
**Scope:** `packages/client-wirer`, `packages/tally-autofix`, `apps/cli`, `apps/mcp-server/src/client-config.ts`. **91** unit tests pass (`client-wirer` 44, `tally-autofix` 37, `cli` 10).

**Since last review (`453e2fb`):** Five fix commits address all prior High/Medium CA-safety and validation findings (`cb5810f` … `29813d7`).

## Resolved (previous review)

| Finding | Fix |
|--------|-----|
| Non-atomic `tally.ini` writes | `autofix.ts:42,57` uses `writeAtomic`; dedicated `tally-autofix/src/atomic-write.ts` + test asserts no `.tmp` left (`autofix.test.ts:41-43`) |
| `netsh program=` / `name=` without quotes | `firewall.ts:12,31,36,55` — quoted values; test for `TallyPrime (1)` path (`firewall.test.ts:50-56`) |
| JSON shape not validated | `wirer.ts:127-152` guards top-level + `serversKey`; `wirer-shape-validation.test.ts` (4 tests) |
| `remove()` without backup | `wirer.ts:98-99` + `wirer-remove.test.ts` (`.bak` on remove) |
| Unchecked CLI `clientId` cast | `main.ts:10-17` `assertValidClient`; `client-validation.test.ts` (3 tests) |

## Findings (remaining)

### Test design

**Low — CLI still has no subprocess test against built `dist/main.js`** (`apps/cli/test/`)  
Coverage is strong on `run*Command` + `createProgram()` + `assertValidClient`. The `isEntryPoint` / `parseAsync(process.argv)` path and missing `--install-dir` are untested at the binary layer.  
**Fix (Phase 2):** One `execa` test per command on `windows-latest`, or `node apps/cli/dist/main.js --version` in CI.

### Windows edge cases

**Medium — `main.ts` entry-point guard is still strict string equality** (`apps/cli/src/main.ts:77-79`)  
`fileURLToPath(import.meta.url) === process.argv[1]` can fail on Windows when path casing, 8.3 short names, or bin-shim `argv[1]` differ. Symptom: module loads but CLI does nothing.  
**Fix:** `path.resolve()` both sides (case-insensitive on win32) or compare basenames + `realpath`; add subprocess smoke in manual checklist / CI.

**Low — `tasklist` locale / output parsing** (`tally-process.ts:4-5`) — unchanged; acceptable for Phase 1 power-user CLI.

**Low — `TallyIni.serialize()` may normalize CRLF → LF** (`tally-ini.ts:68`) — unchanged; Tally usually tolerates.

**Low — `writeAtomic` rename vs AV lock** (`atomic-write.ts:17` in both packages) — no retry if `rename` fails while target open; rare on config files.

### TypeScript / API

**Low — `deepEqual` still uses `JSON.stringify`** (`wirer.ts:157-159`)  
Can spuriously report `updated` if `env` key order differs; paths built via `join()` are stable today.  
**Fix:** Field-wise compare on `McpServerEntry` if this causes support noise.

**Low — Parsed `tallymcp-pro` entries are not Zod-validated on read** (`wirer.ts`)  
Container shape is guarded; a pre-existing malformed entry object could still flow through `deepEqual` / merge. Unlikely for CA configs.  
**Fix:** `McpServerEntrySchema.safeParse(currentEntry)` before merge when entry present.

**Low — `program="${path}"` breaks if `tallyExePath` contains `"`** (`firewall.ts:36`)  
Absurd path edge case; document or escape embedded quotes.

### Cross-package / hygiene

**Low — Duplicate `atomic-write.ts`** in `client-wirer` and `tally-autofix` — identical 18-line modules; keeps DAG clean (no `tally-autofix` → `client-wirer`). Accept or extract shared util in Phase 2.

**Low — `@tallymcp/shared-types` still unused** (`client-wirer/package.json:21`).

**Low — `FakeExecRunner` exported from production API** (`tally-autofix/src/index.ts:17`).

**Low — `detectTallyInstall` union + `as TallyInstall[]` in CLI** (`tally-fix.ts:47-50`) — works with `returnAll: true`; split API is cleaner later.

### Security / coupling

- **`spawn` with discrete argv** — no shell injection; firewall paths passed as single quoted args. Good.
- **Allowlist paths** — `CLIENT_REGISTRY` only; no path traversal in resolver (templates fixed). Good.
- **`claude-code` in `client-config.ts`** — aligned with installer JSON shape.

## Verdict

**✅ READY TO MERGE** — Prior High/Medium blockers are fixed with tests. Remaining items are Phase 2 hardening (subprocess CLI smoke, robust entry-point detection) and low-priority hygiene. Run `docs/v1-installer-phase1-manual-smoke.md` on a real Windows + Tally box before declaring Phase 1 done for CAs.

### Phase 2 backlog (nits)

1. Subprocess / `windows-latest` smoke for `dist/main.js`
2. Normalize `isEntryPoint` path comparison on Windows
3. Deduplicate or share `writeAtomic`
4. Remove unused `shared-types` dep or wire shared `ClientId`
5. Stop exporting `FakeExecRunner` from package root
