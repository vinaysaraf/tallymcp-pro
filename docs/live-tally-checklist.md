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

## v0.7.1 — All 12 connectors live-verified (2026-05-25)

**Spec §2 success metric:** every report connector returns real data from
the live `OM JAI JAGDISH` book on TallyPrime Silver. Tally instance stays
responsive after the full sweep.

**Run:**
```cmd
pnpm verify-all-reports
```

**Result (run 2026-05-25, fresh Tally start, FY 22-23):**

| # | Connector | Path | Wall-clock | Rows | Pass? |
|---:|---|---|---:|---:|:---:|
| 1 | `list-companies` | legacy / utf-8 / Collection | 36 ms | 1 | ✅ |
| 2 | `company-info` | legacy / utf-8 / Collection | 10 ms | 1 | ✅ |
| 3 | `list-ledgers` | legacy / utf-8 / Collection | 452 ms | 3,689 | ✅ |
| 4 | `list-groups` | legacy / utf-8 / Collection | 19 ms | 35 | ✅ |
| 5 | `list-voucher-types` | legacy / utf-8 / Collection | 10 ms | 26 | ✅ |
| 6 | `ledger-closing-balance` (Cash) | **tdl / utf-16 / trial-balance template** | 452 ms | 1 | ✅ |
| 7 | `group-closing-balances` (Sales Accounts) | **tdl / utf-16 / trial-balance template** | 229 ms | 3 | ✅ |
| 8 | `trial-balance` | tdl / utf-16 | 229 ms | 3,689 | ✅ |
| 9 | `profit-and-loss` | tdl / utf-16 | 8 ms | 7 | ✅ |
| 10 | `balance-sheet` | tdl / utf-16 | 8 ms | 28 | ✅ |
| 11 | `day-book` | tdl / utf-16 | 6,296 ms | 21,827 | ✅ |
| 12 | `sales-register` | tdl / utf-16 (`$$IsSales` filter) | 8,203 ms | 13,097 | ✅ |

**Total runtime:** ~16 s for the full sweep. **Post-run probe:** 6 ms (Tally
fully responsive, no wedge).

**Key fix landed in this run:**
`packages/report-engine/src/connectors/ledger-balance.ts` — previously used
a raw `Collection`+`FETCH` envelope with a `$ClosingBalance` projection over
all 3,689 ledgers. On Silver, Tally evaluates `$ClosingBalance` before any
filter, so the request ran past the 10 s headersTimeout and wedged the
gateway, poisoning every subsequent request in the sweep (7/12 failures).
Now backed by the proven `trial-balance` TDL template — same data, fast
projection, then client-side filter. Connector public API unchanged.

**Decision: ✅ TallyMCP Pro v0.7.1 read-only path is live-verified.** All
12 MCP report connectors return real data from the live book in under
9 seconds each, and the full 12-report sweep does not wedge the gateway.
The Silver-edition workaround documented in v0.6 (`tally_import_vouchers_from_file`)
remains; write-side flow is out of scope for this release.
