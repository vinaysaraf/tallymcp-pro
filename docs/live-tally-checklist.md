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

**Result (fill in after running):**

| Metric | Target | Actual | Pass? |
|---|---|---|---|
| TB latency | < 5,000 ms | _____ ms | ⬜ |
| Rows returned | ≥ 1 | _____ | ⬜ |
| Tally responsive after | < 2,000 ms follow-up | _____ ms | ⬜ |
| Tally restart needed | No | ⬜ Yes ⬜ No | ⬜ |
| Charset that worked | utf-16 (default) | _____ | — |
| Date run | — | _____ (YYYY-MM-DD HH:MM) | — |
| Tally edition | — | _____ | — |
| Operator notes | — | _____ | — |

**Decision after run:**

- ✅ All three pass → proceed to v0.7.1 (rewire B2–B7 + dispatcher).
- ❌ Any failure → **abort v0.7**. Open an issue describing the symptom,
  the wall-clock, the row count, and the body of any error message.
  Re-design before any further v0.7 work.
