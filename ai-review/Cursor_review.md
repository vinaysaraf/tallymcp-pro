# Cursor review — Phase 3.1 plan (admin/elevation UX hotfix)

**Date:** 2026-05-26  
**Branch:** (not yet created — plan-only)  
**Base:** `main` @ `c90848d` (Phase 3 merged)  
**Plan:** `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md` (~2,100 lines, 12 tasks)  
**Spec:** `docs/superpowers/specs/2026-05-25-tallymcp-installer-design.md` v1.0.3 (§7, §7.5)

---

## Findings

### High

**H1 — Health Check still hard-gates on missing firewall rule after successful skip (user can remain stuck)**  
Patch A explains the skip but `needsFix` is unchanged:

```920:920:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
  const needsFix = status.tallyInstalled && (!status.xmlInterfaceEnabled || !status.firewallRulePresent);
```

After `tallyFix` with `skipped-non-admin`: XML on, firewall still missing → `needsFix` stays true → **"Fix both (Admin needed)"** loops. No **Continue / Re-check only** when `firewallSkipReason` is set and XML is OK. Spec §7.5 GP row says "No retry storm" — this is adjacent. **Fix:** when `xmlInterfaceEnabled && firewallSkipReason`, show Re-check + loopback copy instead of Fix loop (or split `needsFix` into xml vs firewall).

**H2 — Task 2 `vi.spyOn(writeAtomicModule, "writeAtomic")` likely won't intercept `autofix.ts` calls**  
`autofix.ts` uses a static named import:

```5:5:packages/tally-autofix/src/autofix.ts
import { writeAtomic } from "./atomic-write.js";
```

Plan mocks the export after dynamic import (L243–248) but ESM binds `writeAtomic` at module load — spy on `atomic-write.js` often **does not** replace the binding inside `autofix.js`. Tests may pass only if Vitest rewrites the graph; likely **red never goes green** without `vi.mock("../src/atomic-write.js", …)` or dependency injection. **Fix before Task 2 execution.**

**H3 — `handleFixAll`: `healthCheck()` failure after successful `tallyFix` drops firewall UX**  

```1407:1424:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
      const result = await api.tallyFix();
      setHealth(await api.healthCheck());
      // Phase 3.1 Patch A + D: surface the firewall outcome.
      if (result.firewallRule === "skipped-non-admin") {
```

If `healthCheck()` throws, `catch` runs — **`setFirewallSkipReason` / modal never run** though fix succeeded. **Fix:** set skip reason / modal from `result` before refresh; wrap `healthCheck` separately.

### Medium

**M1 — Test math: DoD ~92 / +16 configurator; task checkpoints sum to 89 / +13**  

| Task | Δ |
|------|---|
| 4 | +2 |
| 5 | +2 |
| 6 | +2 |
| 7 | +2 |
| 8 | +3 |
| 9 | +2 |
| **Σ** | **+13 → 89** |

DoD L33, CHANGELOG L1504, Task 12 L1669 say **~92 / +16**. tally-autofix **44→51 (+7)** ✓. Align DoD or add 3 tests (e.g. `handleTallyFix` `group-policy-blocked`, `TallyIniLockedError` IPC, `firewallSkipReason` on `group-policy` without modal-only).

**M2 — `ITPolicyHelpModal` hardcodes `C:\Program Files\TallyPrime\tally.exe`**  

```1258:1258:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
{`netsh advfirewall firewall add rule name="TallyMCP — Tally XML port 9000" ... program="C:\\Program Files\\TallyPrime\\tally.exe" ...`}
```

`addFirewallRule` uses `opts.tallyExePath` (spec §7.5 multiple installs). Modal should take `tallyExePath` or `tallyInstallDir` from `health.tallyInstallDir` (Task 9).

**M3 — `GroupPolicyError` detection: `/group policy/i` on stderr is English-centric**  

```444:445:docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
    if (/group policy/i.test(result.stderr)) {
      throw new GroupPolicyError();
```

Spec §7.5 L258 expects GP messaging; localized `netsh` may not match. Consider exit-code heuristics + English fallback, or document English-only v1.0.

**M4 — Spec §7.5 edge cases not in Phase 3.1 scope (acceptable hotfix gaps, document)**  

| §7.5 case | Plan |
|-----------|------|
| Tally won't close (60 s modal) | Deferred L84 — `TallyIniLockedError` mentions running Tally only |
| Antivirus blocks `netsh` | **Not mapped** — generic `Error` → ErrorBanner, no guide |
| `tally.ini` missing | detect path — not 3.1 |
| Port 9000 in use | **Not mapped** |
| GP blocks firewall | Tasks 3, 8, 9 ✓ |
| Multiple installs | Phase 2 `resolveSingleInstall` — modal path not 3.1 |

**M5 — `firewallSkipReason: "group-policy"` set but Patch A card is `non-admin` only**  
Task 9 sets `"group-policy"` + opens modal (L1413–1415); Task 6 yellow card only when `=== "non-admin"` (L963). Intentional (modal = D) — OK; ensure navigating away clears both.

### Nit

**N1 — Symbol chain consistent** — `FirewallSkipReason` Task 5 → Task 6/9 ✓; `isElevated` Task 4 → Task 7 ✓; `group-policy-blocked` Task 3/4 → Task 9 switch ✓; `TallyIniLockedError` Task 2 → `handleFixAll` catch only ✓; `detectIsElevated` Task 1 → `handleHealthCheck` Task 4 only ✓.

**N2 — Execution order 1→12** — No inversion. Shared files: `autofix.ts` (2→3), `index.ts` (1→2→3), `HealthCheck.tsx` (6→7), `autofix.test.ts` (2→3). Task 3 note "requires Task 2 scaffold" = same file order, not circular.

**N3 — Placeholders / TDD** — No TBD/TODO/`implement later`/`similar to Task N`. Full code blocks; red→green→commit per task ✓.

**N4 — No auto-elevation** — Out of scope L82–83; NSIS user-mode ✓.

**N5 — `ITPolicyHelpModal` netsh vs `firewall.ts`** — Args match `addFirewallRule` L40–49 (`dir=in`, `protocol=TCP`, `localport=9000`, `profile=private`, `enable=yes`, rule name). PowerShell equivalent is reasonable; only `program=` path is the drift (M2).

**N6 — Task 4 Step 1 title "2 new channels"** — N/A here; ipc-handlers adds 0 channels ✓.

**N7 — `clearLastError()` on skip/GP paths (Task 9 L1412–1420)** — Intentional: avoid stale EPERM while showing yellow card/modal. Not masking `tallyFix` throw path (catch L1422–1423) ✓.

---

## Spec coverage (§7 + §7.5)

| Area | Mapped |
|------|--------|
| §7.2 XML write / permission failure | Task 2 `TallyIniLockedError` |
| §7.3 firewall add / admin | Tasks 1, 3, 4, 6, 7, 8, 9 |
| §7.5 GP firewall block | Tasks 3, 8, 9 (+ modal copy) |
| §7.5 non-admin / elevation | Tasks 1, 6, 7, 9 |
| §7.2 close-Tally-before-edit modal | Deferred (message-only) |
| §7.5 antivirus / port-in-use | Not in plan |
| No UAC auto-elevate | Deferred L82 ✓ |

---

## Verdict

**🟡 READY WITH FOLLOW-UPS** — Patch A–D architecture is sound and symbols align. **Fix H1** (post-skip Health Check gate) and **H2** (Task 2 mock strategy) before subagent execution; **H3** + **M1–M2** recommended in same pass. After those: **✅ READY TO EXECUTE**.

---

## Round 1 resolutions (applied 2026-05-26)

All 8 findings applied inline to `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md`. Round 2 review requested next.

| ID | Severity | Status | Fix location | Approach |
|----|----------|--------|--------------|----------|
| **H1** | High | ✅ Fixed | Task 6, `HealthCheck.tsx` line gate | Split `needsFix` into `xmlNeedsFix \|\| (firewallNeedsFix && !firewallIsKnownSkipped)`. Added 3rd Patch A test asserting "Re-check" button (not "Fix both") renders in post-skip XML-OK state. Per-task count bumped 82→83; cascaded through Tasks 7→8→9 (85, 88, 90). |
| **H2** | High | ✅ Fixed | Task 2, `autofix.test.ts` mock setup | Replaced `vi.spyOn(writeAtomicModule, "writeAtomic")` with `vi.mock("../src/atomic-write.js", () => ({ writeAtomic: vi.fn(...) }))` at module scope + a `writeAtomicState` bag controlled by `beforeEach`. Default implementation delegates to `node:fs/promises.writeFile` so happy-path tests still pass; `nextError` slot toggles the EPERM/EACCES branches. |
| **H3** | High | ✅ Fixed | Task 9, `handleFixAll` body | Reordered: process `result.firewallRule` (set `firewallSkipReason` / open modal) BEFORE calling `api.healthCheck()`. Wrapped `setHealth(await api.healthCheck())` in its own try/catch that surfaces a "Couldn't refresh status: …" message via `setLastError` but does NOT clear the firewall UX. Outer catch only handles `tallyFix()` throws (TallyIniLockedError + transport). |
| **M1** | Medium | ✅ Fixed | DoD line, CHANGELOG, Task 12 final gate, per-task `Step 4` checkpoints | Reconciled to **+14 configurator / 76→90** (the extra +1 over Cursor's +13 comes from H1's added Re-check test). `@tallymcp/tally-autofix` count unchanged at +7 / 44→51. Per-task expected counts cascaded: Task 6 → 83, Task 7 → 85, Task 8 → 88, Task 9 → 90. |
| **M2** | Medium | ✅ Fixed | Task 8 (`ITPolicyHelpModalProps`) + Task 9 (App.tsx instantiation) | Added required `tallyExePath: string` prop to `ITPolicyHelpModalProps`; netsh + PowerShell command strings interpolate `${tallyExePath}` instead of the hardcoded `C:\Program Files\TallyPrime\tally.exe`. App.tsx passes `health.tallyInstallDir + "\\tally.exe"` with a defensive Program Files fallback for the race window. Tests now use `D:\Tally Solutions\TallyPrime\tally.exe` so a hardcoded regression is detectable. |
| **M3** | Medium | ✅ Documented | Plan §"Out of scope" | Added explicit "English-only `netsh` Group Policy detection" deferral note. Tracks the localization gap (Hindi/Tamil/Bengali Windows locales) + v1.1 plan: combine regex with exit-code heuristic + translation table. |
| **M4** | Medium | ✅ Documented | Plan §"Out of scope" | Added 5 §7.5 edge cases deferred to v1.1: antivirus blocks netsh, port 9000 in use, multiple installs picker, tally.ini ENOENT, "Tally won't close" 60s modal. Each with a concrete v1.1 implementation sketch. |
| **M5** | Polish | ✅ Fixed | Task 6 (Patch A guard) + Task 9 (`handleFixAll`) | Added matched code comments at both ends explaining that `firewallSkipReason: "group-policy"` is intentionally routed to ITPolicyHelpModal (Patch D), not the Patch A yellow card. Comment in HealthCheck.tsx also notes that both states still trigger the post-skip Re-check gate via `firewallIsKnownSkipped` (links H1 + M5). |

**Status:** ✅ All Round 1 findings resolved inline. Awaiting Cursor Round 2 verification.

---

## Round 2 — verification (2026-05-26)

**Verdict: ✅ READY TO EXECUTE** — all Round 1 fixes verified in `docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md`.

### Verified fixes (exact anchors)

**H1 (HealthCheck skip gate + Re-check test)**

```965:971:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
const xmlNeedsFix = status.tallyInstalled && !status.xmlInterfaceEnabled;
const firewallNeedsFix = status.tallyInstalled && !status.firewallRulePresent;
const firewallIsKnownSkipped = firewallSkipReason !== undefined;
const needsFix = xmlNeedsFix || (firewallNeedsFix && !firewallIsKnownSkipped);
```

```886:907:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
it("shows Re-check (not Fix loop) when XML is OK and firewall was skipped (Cursor H1)", () => {
  // Post-skip state: XML on, firewall missing but known-skipped.
  // Patch A's split gate uses firewallSkipReason to switch to Re-check.
  ...
  expect(screen.getByRole("button", { name: /Re-check/i })).toBeDefined();
  expect(screen.queryByRole("button", { name: /Fix both/i })).toBeNull();
});
```

**H2 (Task 2 atomic-write mocking via `vi.mock` + state bag; spy removed)**

```235:255:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
vi.mock("../src/atomic-write.js", () => ({
  writeAtomic: vi.fn(async (path: string, content: string) => { ... }),
}));

beforeEach(() => {
  writeAtomicState.nextError = undefined;
  writeAtomicState.callCount = 0;
});
```

**H3 (Task 9 `handleFixAll`: process `result.firewallRule` BEFORE `healthCheck()`; refresh wrapped separately)**

```1480:1519:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
const result = await api.tallyFix();
if (result.firewallRule === "skipped-non-admin") { ... }
else if (result.firewallRule === "group-policy-blocked") { ... }
else { clearFirewallSkipReason(); clearLastError(); }

try {
  setHealth(await api.healthCheck());
} catch (refreshErr) {
  setLastError(`Couldn't refresh status: ${(refreshErr as Error).message}`);
}
} catch (err) {
  setLastError((err as Error).message);
}
```

**M1 (counts + DoD / per-task expected checkpoints / Task 12 final gate)**

```1611:1612:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
+14 net new configurator unit tests. Configurator count: **76 → 90**.
```

```1075:1075:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Expected: **83/83** unit tests pass
```
```1184:1184:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Expected: **85/85** unit tests pass
```
```1371:1372:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Expected: **88/88** unit tests pass
```
```1564:1565:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Expected: **90/90** unit tests pass
```
```1745:1745:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Configurator: **90 unit** + 4 E2E.
```

**M2 (ITPolicyHelpModal: required `tallyExePath` prop + `${tallyExePath}` interpolation; App.tsx passes health-derived path; test uses D:\\...)**

```1260:1272:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
export interface ITPolicyHelpModalProps {
  tallyExePath: string;
  onClose: () => void;
}
```

```1334:1345:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
program="${tallyExePath}"
...
-Program "${tallyExePath}"
```

```1546:1550:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
tallyExePath={
  health?.tallyInstallDir ? `${health.tallyInstallDir}\\tally.exe`
  : "C:\\Program Files\\TallyPrime\\tally.exe"
}
```

```1214:1214:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
const tallyExePath = "D:\\Tally Solutions\\TallyPrime\\tally.exe";
```

**M3 + M4 (Out-of-scope includes English-only GP note + 5 §7.5 deferrals)**

```86:92:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
Localized `netsh` Group Policy detection (Cursor M3) — English-only deferral note.
Other §7.5 edge cases deferred: antivirus blocks netsh, port 9000 in use, multiple installs picker, tally.ini ENOENT, "Tally won't close" 60s modal.
```

**M5 (routing comment present in both Task 6 + Task 9)**

```1014:1022:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
// Patch A yellow card is **deliberately scoped to "non-admin"** —
// "group-policy" case is routed to ITPolicyHelpModal (Patch D) ...
```

```1489:1493:c:/Projects/Tally MCP/docs/superpowers/plans/2026-05-26-tallymcp-installer-v1.0-phase3.1.md
// firewallSkipReason: "group-policy" is intentionally
// routed to ITPolicyHelpModal, not the Patch A yellow card —
```

