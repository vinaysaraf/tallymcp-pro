# Cursor review — Phase 2 Configurator (code)

**Date:** 2026-05-26
**Branch:** `feat/v1.0-installer-phase2`
**Range reviewed:** `14b9ac7..83b19e4` (33 commits) — verdict: 🟡 MERGE WITH FOLLOW-UPS
**Fix commit:** `f808be9` — H1 + M2 + N4 addressed
**Tip after fixes:** `f808be9` (34 commits ahead of `main`)

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
