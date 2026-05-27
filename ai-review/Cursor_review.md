# Cursor review — PR #10 v1.0.3 MSIX hotfix

**Date:** 2026-05-27  
**Branch:** `feat/v1.0.3-msix-detection` → `main`  
**Tip SHA:** `4b8d96c`  
**Scope:** Holistic PR review — MSIX Claude paths, DoneScreen, AddMcpModal wire warning, Disconnect UI, CI fix

## Findings

### Multi-path atomicity (`wirer.ts:81-87`)

Documented sequential-write tradeoff is appropriate for v1.0.3. `.bak` per path + Reconfigure recovery is sufficient. No rollback needed before merge.

### MSIX glob (`claude-desktop-paths.ts:64-78`)

`Claude_*` prefix + `existsSync` on sandbox dir is correct. Writing to all matches during Store package transition is **desired** (avoids wiring only a stale package). Do not add mtime filtering.

### `detectConfiguredClients` (`ipc-handlers.ts:107-147`)

Any-path match → configured is correct. Stale MSIX-only entry → Connected + Disconnect cleans both paths via multi-path `remove()`. Semantics align with user expectation.

### Wire-time MSIX warning (`App.tsx:292`, `AddMcpModal.tsx:122`)

Guard is `clientId === "claude-desktop" && msixDetected` where `msixDetected = health?.claudeDesktopVariants?.includes("msix")`. Verified: Cursor modal with `msixDetected=true` does not show warning (`AddMcpModal.test.tsx`). Placement correct.

### Disconnect UX (`DisconnectConfirmModal.tsx`, `App.tsx:109-125`)

Confirm modal matches Restore pattern; red-700 palette valid. Silent `noop` + `unmarkClientConfigured` is acceptable for hotfix. Optional toast deferred per CHANGELOG.

### Reconfigure after Store install

`resolveClaudeDesktopConfigPaths` runs at wire time (not cached). Reconfigure re-probes filesystem → writes MSIX path when sandbox appears. Covered by `wirer-add.test.ts` MSIX cases.

### CI `try/catch` (`ipc-handlers.ts:227-234`)

Broad catch is acceptable for health-check UX (empty variants → no false MSIX warning on Linux). Wire path uses real `process.env` on Windows. **Follow-up:** narrow to `err.message.includes("APPDATA")` or check `env.APPDATA` before call.

### Type duplication

`ClientConfigVariant` in `client-wirer/types.ts` + `ipc-types.ts` mirrors existing `ClientId` pattern. `ipc-handlers.ts` imports from `@tallymcp/client-wirer` for runtime; renderer uses `ipc-types`. Low drift risk if both stay string-literal unions — add a one-line sync comment in `ipc-types.ts` pointing to client-wirer source of truth.

### Tests (+30)

Strong unit coverage: `claude-desktop-paths` (6), wirer MSIX (4), ipc-handlers-msix (4), DoneScreen (6), AddMcpModal (3), disconnect components (7). Local run: **140/140** configurator, full workspace green.

**Gaps (non-blocking):** no `App.test.tsx` integration for Disconnect click → `unwireMcp` → tile flip; no single test chaining AddMcpModal MSIX warning → wire → DoneScreen MSIX card (would need App-level or e2e). `buildFakeApi().unwireMcp` mock omits `configPaths` — harmless at runtime, fix for type hygiene.

### CHANGELOG

Accurate and thorough. **Add under Changed:** `@tallymcp/client-wirer` public types — `WireResult` / `UnwireResult` now require `configPaths` + `variants` (breaking for code that constructs these objects; read-only consumers of `configPath` unchanged). Optional before merge, not blocking.

### Minor nits

- `ClaudeDesktopVariant` vs `ClientConfigVariant` naming in `claude-desktop-paths.ts` vs `types.ts` — cosmetic.
- Post-disconnect `healthCheck()` refresh not called — tile uses optimistic `unmarkClientConfigured`; fine until next mount.
- MSIX-only user who wired before Store install: tile may show Connected (standard path) while Store Claude still empty until **Reconfigure** — document in release notes / friend smoke test.

## Verdict

✅ **APPROVED TO MERGE** — fixes the production MSIX failure; plan-review blockers folded; CI green; tests substantiate behavior.
