# Cursor review — v1.0.3 MSIX hotfix plan

**Date:** 2026-05-27  
**Branch:** (plan only — not yet implemented)  
**Tip SHA:** (n/a — plan review)  
**Scope:** `docs/superpowers/plans/2026-05-27-tallymcp-v1.0.3-msix-detection.md` vs current `main` / v1.0.2 codebase

## Findings

### MSIX path resolution (focus #1)

- **`Claude_*` glob is correct.** Store package family names include a publisher hash (`Claude_pzs8sxrjxfjjc`); prefix match on `Packages\Claude_` is the right future-proof probe. Do not hardcode the hash.
- **Multiple `Claude_*` dirs:** Writing/unwiring **all** matches is correct for mid-update residue (old package + new package). Picking “most recent mtime only” risks leaving the active Store app unwired — defer mtime filtering to Phase 2 unless telemetry shows orphan dirs are a problem.
- **Path suffix:** `LocalCache\Roaming\Claude\claude_desktop_config.json` matches the reported failure; keep filename identical to standalone.
- **Plan gap:** No test for `readdirSync` throwing (permissions / AV lock on `Packages`). Low probability; optional `try/catch` → return `[]` for MSIX leg only.

### AppContainer spawn risk (focus #2)

- Real failure was **config read path**, not spawn — but Store sandbox **can** block `node.exe` under `Program Files`. DoneScreen MSIX caveat is necessary, not sufficient for CA trust.
- **Recommend wire-time warning** when `variants` includes `"msix"` (AddMcpModal body or a yellow callout before Confirm) — same copy as DoneScreen, so users don’t tray-quit twice before learning they may need standalone Claude.

### Multi-path atomicity (focus #3)

- Sequential writes without rollback on path-2 failure → split brain (standard wired, MSIX not). Acceptable for v1.0.3: `.bak` per path, rare, user can Reconfigure. Document in `wirer.ts` one-line comment; rollback is Phase 2.

### `unmarkClientConfigured` / healthCheck race (focus #4)

- `writeAtomic` (fsync + rename) makes unwire durable before IPC returns; `detectConfiguredClients` on next `healthCheck()` should not re-mark. No race in normal flow.
- `App.tsx:37` — `unmarkClientConfigured` is imported but unused today; Task 7 wires it. Add one-line comment after disconnect: “Tile state is optimistic; mount-time healthCheck re-hydrates from disk.”

### Disconnect a11y (focus #5)

- `aria-describedby` on both Restore + Disconnect modals is a small win; not blocking if both stay consistent.

### DoneScreen tests (focus #6)

- `getByText(/system tray/i)` is brittle; prefer `data-testid="claude-tray-quit-instructions"` on the ordered list container.
- Plan’s MSIX test uses `getByText(/Microsoft Store version/i)` — also add `data-testid="msix-caveat"`.

### Tailwind tokens (focus #7) — **blocking**

- `apps/configurator/tailwind.config.ts` has **no** `tm-red-*` or `tm-yellow-*` (only `tm-amber-soft` / `tm-amber-border`).
- Task 6 DoneScreen snippet uses `bg-tm-yellow-soft`, `border-tm-yellow-deep`, `text-tm-yellow-deep` — **these classes will not style** (Tailwind won’t error; UI looks broken).
- Task 7 Disconnect uses `tm-red-*` with fallback note — implementer must use `red-700` / `red-50` **or** add tokens to `tailwind.config.ts` in Task 7 **before** components.
- **Fix plan Task 6:** replace yellow with `tm-amber-soft` / `border-tm-amber-border` / `text-tm-blue-deep` (or add `tm-yellow-*` to config in a dedicated sub-step).

### Disconnect UX (focus #8)

- User “single click” = one obvious control on home tile, not zero confirmation. Confirm modal matches Restore pattern and prevents accidental removal for non-technical CAs. **Keep confirm**; optional post-disconnect toast “Disconnected — restart Claude from system tray if it was open.”

### Disconnect noop (focus #9)

- `action: "noop"` + `unmarkClientConfigured` is correct (tile reflects intent; disk already clean). Optional subtle toast “Already disconnected” — not required for hotfix.

### Spec / placeholder gaps (focus #10)

- Update `packages/client-wirer/test/public-api.test.ts` WireResult/UnwireResult literals when Task 2 lands (plan omits explicit mention).
- Export `resolveClaudeDesktopConfigPaths` from `client-wirer` index if tests import from package root (plan imports `./claude-paths.js` in unit test — OK).
- `ipc-handlers.test.ts` fake runner: use `FakeExecRunner` from `@tallymcp/tally-autofix` for consistency, not ad-hoc `{ exec }` object (minor).
- **Reconfigure path:** After v1.0.3, Reconfigure must hit multi-path `add()` — automatic once wirer changes; no extra task needed.
- **HealthCheck UI:** No change to show “MSIX + standard” paths — acceptable; DoneScreen carries education load.

### TDD / task order

- Task order 1→2→3→4→5→6→7→8→9 is sound. Task 2 will break `public-api.test.ts` until Task 3 completes — run package tests per task or batch 2+3.
- Claimed +22 tests: plausible (6 path + 2 types + 4 wirer + 12 renderer + modal tests).

## Verdict

⚠ **NEEDS REVISION** — fix Task 6 Tailwind class names (or add tokens) before execute; add wire-time MSIX warning as a plan bullet (recommended, not blocking if DoneScreen caveat ships).
