# Cursor review — CLI preview-and-confirm UX (re-review after fixes)

**Date:** 2026-05-25  
**Branch:** `feat/v1.0-installer-phase1`  
**Tip SHA:** `0ee0eae`  
**Scope:** `apps/cli` consent UX (`confirm.ts`, `commands/*`, `main.ts`, tests). Three fix commits since `79ab0df` (`e543e2f`, `878a2cd`, `0ee0eae`). **27** CLI tests pass.

## Resolved since `79ab0df`

| Prior finding | Fix |
|---------------|-----|
| Non-TTY hang without `--yes` | `assertInteractiveOrYes()` in `confirm.ts:21-27`; called after preview in all four commands |
| `unwire` hardcoded `mcpServers` | `unwire.ts:16-20` uses `CLIENT_REGISTRY[clientId].serversKey`; `unwire-cli.test.ts` Ollama preview test |
| `wire` preview invalid JSON / unescaped paths | `wire.ts:28-31` uses `JSON.stringify`; `wire-cli.test.ts` parses snippet as JSON |
| `tally-fix` backup path + close-Tally note | Full `install.iniPath.tallymcp-bak` + “TallyPrime must be closed…” (`tally-fix.ts:77-78`) |
| No `readStdinConfirm` tests | `confirm.test.ts` — `y`, `YES`, empty, `n` with mocked stdin |
| No `assertInteractiveOrYes` tests | `confirm.test.ts:18-39` — TTY false + `yes: false` throws; `yes: true` no-op |

## Findings (remaining)

### Consent / UX

**Good**

- Preview → `assertInteractiveOrYes` → `[y/N]` → mutate; order is consistent on all commands.
- Non-TTY fast-fail message is CA/script-friendly and mentions `--yes (-y)`.
- Preview-after-TTY-check (not before) keeps audit trail in CI logs when operators forget `-y` — documented in `confirm.ts:17-19`.
- Abort paths still prevent writes (`wire`/`unwire`/`tally-fix` tests with mocked TTY + `confirmFn: false`).
- Ollama `servers` key correct in wire and unwire previews.

**Low — Non-TTY error surfaces as uncaught `Error` in `main.ts`** (`main.ts:41-46`)  
`assertInteractiveOrYes` throws generic `Error`; only `AbortError` gets `Aborted.` + exit 1. Script/CI without `-y` may print a Node stack after preview. Message itself is fine.  
**Fix:** Catch that message (or a small `NonInteractiveError` subclass) and `console.error(err.message); process.exit(1)`.

**Low — `tally-restore` preview still omits “close Tally first”** (`tally-restore.ts:51-53`)  
`restoreTallyIni` also requires Tally closed (enforced after confirm). Same pattern as pre-fix `tally-fix`; optional parity bullet.

**Low — SIGINT during `rl.question`** — still unhandled; Ctrl+C may exit without `Aborted.` (unchanged from prior review).

### `confirm.ts` edge cases

**Good**

- Empty / `n` → false; `y` / `yes` → true (`confirm.ts:38`, tests).
- `finally { rl.close() }` unchanged.

**Low — No EOF-only test**  
`readStdinConfirm` tests use `Readable.from([input])` with newline; closed stdin without data not covered. Behavior is likely empty → false → abort; acceptable.

**Low — `assertInteractiveOrYes({ yes: false })` tested but not `yes: undefined`**  
Commands pass `opts.yes` before `?? false` only for confirm branch; guard uses `if (opts.yes) return` so `undefined` correctly falls through to TTY check. OK.

### Test design

**Good**

- Command abort tests set `isTTY: true` so they reach `confirmFn` (not short-circuited by guard).
- Wire JSON preview regression; Ollama unwire preview regression.

**Low — No end-to-end test that `runWireCommand` throws non-TTY after printing preview**  
Unit test on `assertInteractiveOrYes` is sufficient for logic; optional integration test with `isTTY: false`, `yes: false`.

**Low — Commander / `dist/main.js` subprocess** — still out of scope (Phase 2).

### Libraries

`client-wirer` / `tally-autofix` unchanged since `29813d7` ✅ — no regression in this delta.

## Verdict

**✅ READY TO MERGE** — All blocking/follow-up items from the `79ab0df` review are addressed with tests. Consent design is sound for Phase 1 power users and Configurator reuse.

### Optional polish (Phase 2 backlog)

1. Friendly exit in `main.ts` for non-TTY `Error` (no stack trace)
2. “Close Tally first” in `tally-restore` preview
3. SIGINT → `AbortError` + `rl.close()`
4. Subprocess smoke: `node dist/main.js wire … -y`
