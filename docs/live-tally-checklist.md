# Live Tally Checklist

This file captures empirical evidence from live-Tally runs. **Pasting actual
numbers here is part of every release's Definition of Done**: the spec
(`docs/superpowers/specs/2026-05-24-tdl-engine-audit-reports-design.md`)
defines per-release success metrics, and the wall-clock + row counts behind
them live here so the evidence is in-repo, not only in commit messages.

## v0.7.0 — TDL engine kill-switch (TB proof)

**Spec §2 success metric:** Trial Balance latency <5 s on the
`OM JAI JAGDISH` book (3,689 ledgers) on TallyPrime Silver. Tally instance
stays responsive afterwards.

**Run:**
```cmd
pnpm v070-tb-proof
```

If the UTF-16 default produces an EXCEPTION or unparseable response on a
particular Tally instance, fall back to UTF-8 and re-run:
```cmd
pnpm v070-tb-proof --charset utf-8
```

**Result (run 2026-05-24):**

| Metric | Target | Actual | Pass? |
|---|---|---|---|
| TB latency | < 5,000 ms | **330 ms** | ✅ (~15× under budget) |
| Rows returned | ≥ 1 | **3,689** | ✅ (full ledger set projected) |
| Tally responsive after | < 2,000 ms follow-up | **4 ms** | ✅ |
| Tally restart needed | No | **No** | ✅ |
| Charset that worked | utf-16 (default) | utf-16 | — |
| Date run | — | 2026-05-24 | — |
| Tally edition | — | TallyPrime Silver | — |
| Operator notes | — | Sample sign convention (`dr`/`cr` columns) is inverted relative to typical TB display because the TDL formula uses `-$$Number:$DebitTotals`. Calibration of display semantics deferred to v0.7.1 when downstream consumers (B5/B6 closing-balance tools) land. Performance proof unaffected. | — |

**Decision: ✅ PROCEED to v0.7.1.** The TDL engine + UTF-16 transport pipeline
returns the full 3,689-row Trial Balance against `OM JAI JAGDISH` in 330 ms —
15× under the 5,000 ms kill-switch budget — and leaves the Tally instance
fully responsive (follow-up master query in 4 ms). The architectural bet is
empirically validated. v0.7.1 (rewire B2–B7 connectors + dispatcher through
`tdl-engine`) is unblocked.
