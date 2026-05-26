# Cursor review — Phase 2 Configurator (code)

**Date:** 2026-05-26
**Branch:** `feat/v1.0-installer-phase2`
**Range reviewed:** `14b9ac7..83b19e4` (33 commits) — verdict: 🟡 MERGE WITH FOLLOW-UPS
**Fix commits:** `f808be9` (H1/M2/N4), `c21a561` (review doc)  
**Tip SHA:** `c21a561` (35 commits ahead of `main`)

---

## Resolutions

| # | Severity | Finding | Resolution |
|---|---|---|---|
| **H1** | High | `wireMcp` trusts renderer-supplied `installDir` (IPC trust boundary gap) | **Fixed in `f808be9`.** `installDir` removed from `WireRequest`; main injects it via `WireMcpContext` inside `registerIpcHandlers` (mirrors `handleGetConfig`). Renderer now calls `wireMcp({ clientId })` only. Side benefit: `handleConfirmAdd` no longer needs the lazy `getConfig` fallback. |
| **M1** | Medium | `lastError` written to store but never displayed | **Deferred to follow-up.** Cursor flagged this as not merge-blocking. Tracked in commit body. |
| **M2** | Medium | H10 hydrate path has no App-level integration test | **Fixed in `f808be9`.** New test in `App.test.tsx`: mocks `configuredClients: ["claude-desktop"]`, asserts Claude Desktop tile renders with Reconfigure button. (H8 modal-gating test still deferred — `RestoreConfirmModal` unit tests cover the modal in isolation; the App-level gate is exercised manually via the smoke doc.) |
| **M3** | Medium | Tally IPC error paths lack renderer handling | **Deferred to follow-up.** Cursor flagged this as not merge-blocking. Tracked in commit body. |
| **M4** | Medium | `multipleTallyInstalls` backend-only (Phase 2.1) | **Already documented as deferred** per Deviation #5 in the plan. No change. |
| **N1** | Nit | Security flags + preload boundary good | No action (confirmation). |
| **N2** | Nit | H5–H10 wired end-to-end | No action (confirmation). |
| **N3** | Nit | electron-vite v4 preload CJS workaround still required | No action (confirmation). |
| **N4** | Nit | SmartScreenGuide test asserted `≥1` instead of `≥2` for parity | **Fixed in `f808be9`.** Tightened "More info" and "Run anyway" assertions to `≥2`. |
| **N5** | Nit | Test-count drift in plan comments only, not in tests | No action (confirmation). |
| **N6** | Nit | `unmarkClientConfigured` unused (Phase 2.1) | No action — eslint-disable comment is appropriate. |

---

## Verification after fix commit

- `pnpm --filter @tallymcp/configurator typecheck`: ✅ clean
- `pnpm --filter @tallymcp/configurator lint`: ✅ clean
- `pnpm --filter @tallymcp/configurator test`: ✅ **64/64** (+1 from M2 hydration test)
- `pnpm --filter @tallymcp/configurator build`: ✅ all three dist artifacts produced
- `pnpm --filter @tallymcp/configurator e2e`: ✅ 4/4 Playwright Electron tests pass
- `pnpm -r test`: ✅ Phase 1 (45+44+29) + v0.7 (22+22+17+62+36+24+8+44+8+14) + Phase 2 (64) — no regressions

## Deferred for post-merge (Cursor M1, M3)

These are tracked in `f808be9`'s commit body. Both are pure additions; neither alters existing behavior.

1. **M1** — surface `lastError` from Zustand in `StatusBanner` (or a toast/alert), clear on success/navigation. ~30 min.
2. **M3** — wrap `handleFixAll` / `handleRestoreConfirmed` / `handleReCheck` in `try/catch`, surface failures via the same error-display added for M1. ~20 min.

## Verdict (post-fix)

**✅ READY TO MERGE** — H1 merge-blocker resolved; M2 test gap closed; N4 tightened. M1/M3 are post-merge polish per Cursor's original classification.

---

## Round 2

**Range:** `83b19e4..c21a561` (`f808be9`, `c21a561`) — independent re-verification of H1 / M2 / N4 only.

### H1 — installDir IPC boundary

**✅ Fixed in production path.** `WireRequest` is `{ clientId }` only (`ipc-types.ts` L33–38). `handleWireMcp` builds paths from `ctx.installDir` only (`ipc-handlers.ts` L48–58). `registerIpcHandlers` injects `{ installDir: ctx.installDir }` from main boot (`L247–248`). Renderer calls `wireMcp({ clientId: modalFor })` (`App.tsx` L68). `ipc-handlers.test.ts` asserts `node.exe` under context `installDir`, not request field (L21–30).

**No bypass:** `grep` shows no `req.installDir` / `payload.installDir` in `src/`. Extra keys on the IPC payload would be ignored by `handleWireMcp` (defense in depth).

**Nit (tests only):** `preload.test.ts` L11–15 and `ipc-types.test.ts` L27 still construct `wireMcp` / `WireRequest` with `installDir`; those files are outside `tsconfig.node` `include`, so excess-property drift is not typechecked. Runtime still passes 64/64. Update tests to `{ clientId }` only for contract parity — not a security hole.

### M2 — H10 hydration test

**✅ Exercises the real path.** Test overrides `healthCheck` → `configuredClients: ["claude-desktop"]` (`App.test.tsx` L97–105), which drives `useEffect` → `markClientConfigured` (`App.tsx` L49–51). `findByRole("button", { name: /Reconfigure/i })` (L110–112) waits for post-promise re-render — not a fixed `setTimeout`.

**Robust enough:** Single configured tile ⇒ one Reconfigure + one “Connected”; `>= 1` on Connected is loose but stable (no other “Connected” copy in tree). Could tighten to `getByRole` scoped under “Claude Desktop” later; not flaky in practice.

### N4 — SmartScreenGuide `>= 2`

**✅ Consistent with UI.** Component duplicates headlines in two mock panels (`SmartScreenGuide.tsx` L37 + L63) and repeats “More info” / “Run anyway” in step copy + mocks (L34/46/59, L57/59/69). Assertions `>= 2` match comments (`SmartScreenGuide.test.tsx` L16–19).

### New from fix

- **Positive:** Removing renderer `installDir` also dropped the lazy `getConfig` race in `handleConfirmAdd` (`App.tsx` L62–65) — cleaner than Round 1’s `config ?? await getConfig()` approach.
- **Nit only:** Stale `installDir` in two main-process unit tests (above); no new blockers. M1/M3 deferral unchanged and safe.

### Round 2 verdict

**✅ READY TO MERGE**

### Round 2 nit resolution

The two stale `installDir` constructions Cursor flagged (`preload.test.ts` L11/L13–15 and `ipc-types.test.ts` L27) were fixed in `8924c2b` — both files now use `{ clientId }` only, matching the post-H1 `WireRequest` contract. Configurator tests remain 64/64; full workspace build + lint + E2E still green.

**Final tip after round 2:** `8924c2b` (36 commits ahead of `main`).
