# TallyMCP v0.7 — TDL Engine + Audit-Grade Reports

**Status:** v1.1 — Approved for implementation (incorporates review feedback 2026-05-24)
**Date:** 2026-05-24
**Author:** Vinay + Claude
**Supersedes:** v0.6 voucher-collection strategy (kept as Silver file-import fallback only)
**Reference project:** [`dhananjay1405/tally-mcp-server`](https://github.com/dhananjay1405/tally-mcp-server) — ISC-licensed. We adopt the inline-TDL pattern and the UTF-16 LE transport. Template XML structure may be derived from theirs (compatible license; attribution in CHANGELOG when shipped).

---

## TL;DR

Today our MCP times out on TallyPrime Silver because we ask Tally for raw collections
(`<TYPE>Collection</TYPE>` with a `<FETCH>` projection) and then aggregate
client-side. The working CA project we studied
(`dhananjay1405/tally-mcp-server`) takes the opposite path: it sends **inline
TDL report definitions** (`REPORT + FORM + PART + LINE + FIELDs + COLLECTION`),
letting Tally's own TDL VM project rows server-side. Result: Trial Balance,
P&L, Balance Sheet — and every balance-class report — return in seconds on the
same kind of Silver instance that locks ours.

v0.7 adopts that pattern, switches the HTTP transport to UTF-16 LE (the second
empirically-observed speed unlock), and ships **24 audit-grade reports** with
Excel templates across masters, financial statements, ageing, sales/MIS, GST,
and one each from Statutory and Tax Audit. The full 73-report catalog is
sequenced into v0.7/v0.8/v0.9/v1.0 in §13.

For voucher-level anomaly detection (forensic checks) we use TDL `<FILTER>` so
Tally's TDL VM does the scan and we receive only the matching rows. Performance
of filtered Voucher TDL on Silver is the one remaining empirical unknown,
gated to v0.8 after a single probe.

The voucher file-import path from v0.6 (`tally_import_vouchers_from_file`)
stays as the durable Silver fallback for voucher-list use cases.

---

## 0. Relationship to submission plan v1.2

v0.7 is an **engine rewrite, not greenfield**. The AI submission MVP (S0–S4
in `TallyMCP_Implementation_Plan_ReadOnly_Submission.md` v1.2) shipped 15
MCP tools, 18 audit-lite checks, 3 dashboards, and the in-process integration
test harness — all on the original collection-envelope engine. That work is
durable; v0.7 only changes **how** Tally is queried.

| Layer | Submission v0.5/v0.6 | v0.7 | What changes |
|---|---|---|---|
| MCP tool surface | 19 tools | 39 tools (20 new) | Surface grows; v0.6 tools keep names |
| `tally_read_report` dispatcher | Collection+TDL | inline-TDL reports | Backend swap, contract preserved |
| `analytics-engine` | 18 checks, runs on `DataQualityContext.vouchers` | Same code | Only the *source* of `vouchers` changes (file-import on Silver, file-import or Gold-only Day Book stream on Gold) |
| `excel-engine` | T1 (flat register) | T1 + T2 + T3 + T5 | New template families added; T1 reused |
| `tally-connector` | UTF-8 + 15 s/10 s timeouts (v0.6 default) | UTF-16 LE + same timeouts | Transport switch |
| `output-store` | Unchanged | Unchanged | – |

**Sequencing.** Lock the submission demo (v1.2 plan, current state) first.
v0.7 implementation **starts with the TB proof point** (§10 step v0.7.0) on
the live `OM JAI JAGDISH` Silver book — the single empirical question that
de-risks the entire 73-report catalog. Only after TB returns in <5 s on
Silver do we commit to the rest of v0.7.

---

## 1. Problem statement

### What works today

On Silver against a 3,689-ledger book:
- Master queries (companies, ledgers, groups, voucher types) — 30–500 ms.
- Connection diagnostics — 50 ms.

### What's broken today

Same book, same edition:
- Any Voucher collection (full FY, 1-day, narrow or wide FETCH) — Tally hangs
  indefinitely, requires app restart.
- Any `$ClosingBalance` projection over a Ledger collection — same.
- Legacy Trial Balance report form — returns `STATUS=0` with empty `<DATA/>`.

### Why

We're using the wrong shape of request. We ask Tally: *"give me every Ledger
object with these 4 fields, I'll aggregate the closing balance."* Tally has to
materialize all 3,689 ledger objects in memory and compute `$ClosingBalance`
on every one before transmitting. Silver's TDL engine isn't optimized for
that workload.

The fix is: *"compute this custom report I'm defining inline, then send me the
projected rows."* Tally's TDL VM is built for exactly this — it's the same
path the built-in Display reports use. The CA's project proves it works on
the same edition class we're targeting.

---

## 2. Goals & non-goals

### Goals

1. **Sales figure (and every other balance-class question) returns in <5 s on
   Silver** against the `OM JAI JAGDISH` book (3,689 ledgers).
2. **24 audit-grade reports** shipped in v0.7, each with an Excel template.
3. **MCP tool surface stays stable from the LLM's perspective** — every v0.6
   tool keeps its name and input/output contract; only the engine under it
   changes.
4. **New report family is data, not code** — adding a TDL report is editing
   `pull/<name>.xml` + `report-catalog.json`, not writing TypeScript.
5. **Read-only constraint (C-R1) holds** — no IMPORT/alter envelopes, ever.
   Enforced by a CI grep test (§12).
6. **Cross-edition behavior is honest** — capability probe reports what each
   instance can actually serve; tools gate accordingly.

### Success metrics (measurable, on the live Silver book)

| Metric | Target | Measured how |
|---|---|---|
| Trial Balance latency | < 5 s | Wall-clock on `tally_trial_balance` against `OM JAI JAGDISH` FY 22-23 |
| Group closing balance latency (Sales Accounts) | < 5 s | Wall-clock on `tally_get_group_closing_balances` |
| Receivables ageing latency | < 10 s | Wall-clock on `tally_receivables_ageing` |
| Monthly sales (12 calls) | < 15 s end-to-end | `tally_monthly_sales` |
| Reports returning OR failing with CA-friendly message | 24 / 24 | No Tally restart required across the suite |
| Tally instance stability | No lockup | Successive runs of the full suite without restart |
| v0.6 tool backward compat | 19 / 19 tools work | `tally_read_report` for all 10 reportIds still resolves |

### Non-goals

- **No SQL mirror / sync engine.** The bottleneck isn't network, it's how we
  ask Tally. Once TDL fixes that, mirroring buys nothing for the primary use
  cases. (May revisit for offline/multi-machine in a future major version.)
- **No raw voucher dumps for analytics.** Anomaly detection uses TDL FILTER
  to project only matching rows; voucher-list use cases (Day Book CSV export)
  keep the v0.6 file-import path.
- **No new MCP transport.** stdio MCP only.
- **No write tools.** C-R1 holds.
- **No Schedule III mapping editor UI** in v0.7. Mappings live as JSON; UI
  layer is v1.0+.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/mcp-server                                                  │
│    Tool surface unchanged from v0.6 (gates relaxed — see §6).     │
│    New tools added: see §5.                                       │
├──────────────────────────────────────────────────────────────────┤
│  packages/report-engine                                           │
│    Connectors become THIN. Each connector =                       │
│      runTdlReport(name, params) → typed result rows.              │
│    Existing public API (getTrialBalance, getLedgerClosingBalance, │
│    runReport, etc.) preserved; implementations swapped.           │
├──────────────────────────────────────────────────────────────────┤
│  packages/tdl-engine                       ←── NEW                │
│    templates/<report>.xml      — inline TDL definitions           │
│    report-catalog.json         — params + output schema           │
│    schedule3-mapping.json      — Tally group → Sched III head     │
│    src/renderer.ts             — nunjucks template render         │
│    src/parser.ts               — F01..Fn → typed row              │
│    src/run-tdl-report.ts       — orchestrator                     │
├──────────────────────────────────────────────────────────────────┤
│  packages/excel-engine                                            │
│    7 template families (T1–T7) — see §7.                          │
│    New file per family: src/templates/<family>.ts                 │
├──────────────────────────────────────────────────────────────────┤
│  packages/tally-connector                                         │
│    UTF-16 LE transport by default. Config knob to fall back       │
│    to UTF-8. Existing fixture tests stay green.                   │
└──────────────────────────────────────────────────────────────────┘
```

### Why a new `tdl-engine` package

TDL is its own concern: a template language and a row parser keyed by a
schema. `tally-xml` stays a low-level escape/parse helper (it already has 62
tests we don't want to disrupt). `tdl-engine` answers "what reports can we
ask Tally for, and how do we render each?" Two responsibilities, two packages.

### Why keep `report-engine`

It is the public TypeScript API the MCP server, `output-store`,
`analytics-engine`, and scripts call. Its connectors become 8-line adapters
delegating to `tdl-engine.runTdlReport(...)`. No caller above it changes.

### Why pure functions in `tdl-engine`

Render and parse are deterministic, no I/O, no state. Easy to unit-test
against fixtures captured from a real Tally response. The HTTP call lives in
`tally-connector`; orchestration in `tdl-engine` is purely a "render-string →
post → parse" pipeline.

---

## 4. TDL templates (10 files cover all 24 v0.7 reports)

Each template is a `pull/<name>.xml` file containing one `<ENVELOPE>` with an
inline `<TDL><TDLMESSAGE><REPORT>...<COLLECTION>...</COLLECTION></TDLMESSAGE></TDL>`
definition. `report-catalog.json` declares the input parameters (with
type/regex validation), the output `<DATA><ROW>` schema (which `F01..Fn`
columns become which typed fields), and which template file to use.

### v0.7 template files

| # | Template | Underlying Tally collection | Drives reports |
|---|---|---|---|
| 1 | `list-master.xml` | parameterized (Group, Ledger, VoucherType, Unit, Godown, StockGroup, StockItem, CostCategory, CostCentre, AttendanceType, Company, Currency, GSTIN, GSTClassification) | A1, A4, A6, A9 (and the bulk of A) |
| 2 | `chart-of-accounts.xml` | Group | A3 |
| 3 | `ledgers-rich.xml` | Ledger (extended FETCH: Parent, OB, GSTIN, PAN, State, Address) | A2 |
| 4 | `stock-items.xml` | StockItem with HSN, base unit, OB | A5 |
| 5 | `trial-balance.xml` | Ledger with `$OpeningBalance`, `$DebitTotals`, `$CreditTotals`, `$ClosingBalance` | B1, B2, B5, B6, B7 (parameterized by `$Parent` filter), D1 (Sales group), D8 (statutory dues groups), I3 (top customers via Debtors group), I1 (monthly via 12 calls) |
| 6 | `profit-loss.xml` | Group, BS=N, with stock adjustments per CA template | B3, I6 |
| 7 | `balance-sheet.xml` | Group, BS=Y, with closing stock per CA template | B4 |
| 8 | `bills-outstanding.xml` | Bill collection with `$BillDate`, `$Name`, `$ClosingBalance`, `$Parent`, `$_OverDueDays` (per CA template) | G1, G2, G3 |
| 9 | `stock-summary.xml` | StockItem with qty/value at open/inward/outward/close | H1 |
| 10 | `gst-ledger-monthly.xml` | Ledger filtered to GST output ledger names, full-period closing | E1 |

Two patterns we add on top of the CA's catalog:

- **Per-month rollup (E1).** v0.7 ships this as **one TDL call per month** —
  12 sequential balance-class calls, each <1 s on Silver per CA-project
  evidence. Total time ~12 s, acceptable for a monthly trend dashboard.
  A single-call TDL with `$$MonthEnd:$Date` grouping is a v0.9 optimization
  if 12 s becomes a UX problem.
- **Schedule III mapping** is *not* a TDL template — it is a client-side
  composition in `report-engine` that consumes `trial-balance.xml` rows and
  walks `schedule3-mapping.json` to assemble the Schedule III shape. Ships
  in v0.8 with the full Statutory Audit suite.

### Template language

Nunjucks with custom tags (matching the CA project):

```xml
<nunjuck>if targetCompany</nunjuck>
<SVCURRENTCOMPANY>{{targetCompany | escape}}</SVCURRENTCOMPANY>
<nunjuck>endif</nunjuck>
```

…so static-XML parsers don't choke on `{% if %}` syntax. The `tdl-engine`
configures the nunjucks env with these tags.

### Parameter substitution — order of operations (locked)

Two substitution layers, applied **in this exact order**:

1. **Nunjucks render** first — handles conditionals (`<nunjuck>if</nunjuck>`)
   and HTML-escaped variable interpolation (`{{targetCompany | escape}}`).
2. **Angular-bracket simple substitution** second — handles typed parameter
   replacement (`{fromDate}` → `1-Apr-2022`, `{amount}` → `10000`) via
   `substituteTDLParameters()`. Strings are HTML-escaped at this stage;
   dates are formatted `d-MMM-yyyy` (Tally's display format); booleans are
   `Yes`/`No`; numbers are stringified.

**Why this order:** nunjucks sees the raw template with literal `{fromDate}`
strings; it doesn't interpret them. Then angular-bracket substitution
operates on the nunjucks output without nunjucks-tag interference.

**Edge-case test required (§12):** a company name containing `{{`, `}}`, or
`<nunjuck>` must pass through unmangled. Without this test, a malicious or
exotic company name could break either layer.

### Response parsing

Tally returns `<DATA><ROW>...</ROW><ROW>...</ROW></DATA>`. The parser uses
`fast-xml-parser` configured to treat `ROW` and `*.LIST` as arrays. Each row's
`F01..Fn` keys are mapped to typed fields per the schema in
`report-catalog.json`:

```json
{
  "name": "trial-balance",
  "template": "trial-balance.xml",
  "input": [
    { "name": "fromDate", "datatype": "date" },
    { "name": "toDate", "datatype": "date" }
  ],
  "output": {
    "datatype": "array",
    "fields": [
      { "identifier": "F01", "name": "ledger", "datatype": "string" },
      { "identifier": "F02", "name": "group", "datatype": "string" },
      { "identifier": "F03", "name": "opening", "datatype": "number" },
      { "identifier": "F04", "name": "debit", "datatype": "number" },
      { "identifier": "F05", "name": "credit", "datatype": "number" },
      { "identifier": "F06", "name": "closing", "datatype": "number" }
    ]
  }
}
```

`datatype` may be `string`, `number`, `boolean`, `date`, `quantity`, or
`array` (for nested `*.LIST` collections — needed for stock-summary with
batches).

---

## 5. v0.7 report catalog (24 reports)

### A. Masters & chart of accounts (7 reports — all 🟢 balance/static)

| ID | Tool name | Excel |
|---|---|---|
| A1 | `tally_list_companies` (existing — relabel) | T1 |
| A2 | `tally_list_ledgers_rich` (rename of `tally_list_ledgers`, extra fields) | T1 |
| A3 | `tally_chart_of_accounts` (new) | T1 |
| A4 | `tally_list_voucher_types` (existing) | T1 |
| A5 | `tally_list_stock_items` (new) | T1 |
| A6 | `tally_list_godowns` (new) | T1 |
| A9 | `tally_list_gstins` (new) | T1 |

### B. Trial Balance, P&L, Balance Sheet (7 — all 🟢)

| ID | Tool name | Notes | Excel |
|---|---|---|---|
| B1 | `tally_trial_balance` (replaces existing) | Native Tally OB/Dr/Cr/CB columns | T1 |
| B2 | `tally_trial_balance_by_group` (new) | Same template, parent filter | T1 |
| B3 | `tally_profit_loss_statement` (new) | With stock adjustments | T2 |
| B4 | `tally_balance_sheet` (new) | With closing stock | T2 |
| B5 | `tally_get_ledger_closing_balance` (existing — gate removed) | TDL-backed, fast on Silver | inline JSON |
| B6 | `tally_get_group_closing_balances` (existing — gate removed) | The "sales figure" tool | T1 |
| B7 | `tally_cash_bank_balances` (new) | All Cash + Bank ledgers | T1 |

### D. Tax Audit (2 — both 🟢)

| ID | Tool name | 3CD clause | Excel |
|---|---|---|---|
| D1 | `tally_turnover_44ab` (new) | Cl. 40 | T1 |
| D8 | `tally_section_43b_outstanding` (new) | Cl. 26 | T1 |

### E. GST (1 — 🟢)

| ID | Tool name | Excel |
|---|---|---|
| E1 | `tally_gst_output_monthly` (new) | T5 |

### G. Ageing (3 — all 🟢)

| ID | Tool name | Excel |
|---|---|---|
| G1 | `tally_receivables_ageing` (new) | T3 |
| G2 | `tally_payables_ageing` (new) | T3 |
| G3 | `tally_bills_outstanding` (new) | T1 |

### H. Stock (1 — 🟢)

| ID | Tool name | Excel |
|---|---|---|
| H1 | `tally_stock_summary` (new) | T1 |

### I. MIS (3 — 🟢)

| ID | Tool name | Excel |
|---|---|---|
| I1 | `tally_monthly_sales` (new) | T5 |
| I3 | `tally_top_customers` (new) | T1 |
| I6 | `tally_management_snapshot` (new) | T5 |

**Total: 24 reports → 20 new MCP tools** (the other 4 reuse existing tool names —
A1 and A4 already exist; B5 and B6 exist with gates removed).

### `tally_read_report` → TDL template mapping (backward-compat)

The existing dispatcher tool keeps its 10 reportId surface; each route swaps
to the new TDL backend:

| `tally_read_report` reportId | Template (v0.7) | Params |
|---|---|---|
| `ListOfCompanies` | `list-master.xml` (collection=`company`) | — |
| `CompanyInfo` | `list-master.xml` (collection=`company`, filter by name) | `company` |
| `LedgerMasters` | `ledgers-rich.xml` | `company` |
| `GroupMasters` | `chart-of-accounts.xml` | `company` |
| `VoucherTypes` | `list-master.xml` (collection=`vouchertype`) | `company` |
| `DayBook` | **unchanged** — still rejected on Silver, file-import on Gold | `company`, `from`, `to` |
| `TrialBalance` | `trial-balance.xml` | `company`, `from`, `to` |
| `ProfitAndLoss` | `profit-loss.xml` | `company`, `from`, `to` |
| `BalanceSheet` | `balance-sheet.xml` | `company`, `to` |
| `SalesRegister` | **unchanged** — file-import path (voucher-list) | – |

### `tally_list_ledgers` deprecation (decision)

`tally_list_ledgers` (v0.6 — basic 6 fields) and `tally_list_ledgers_rich`
(v0.7 — extended 9 fields including GSTIN/PAN/State/Address) **coexist**.
Old tool stays alive; description gets an annotation pointing to the rich
variant. We do not break LLM prompts that already call the old name.
Removal scheduled for v1.0 with a 6-month deprecation notice in CHANGELOG.

---

## 6. Capability probe — relaxed Silver tier

v0.6 marked Silver as "voucher-disabled, everything voucher-class fails fast."
v0.7 introduces a mid-tier:

```typescript
type TallyTier =
  | "gold"     // TallyPrime 4.x — everything works
  | "silver"   // TDL balance reports work; voucher TDL untested (v0.8)
  | "unknown"; // probe failed / forced
```

The probe still uses two safe queries (master list + legacy TB Report
returning STATUS=0 fast). Tier-derived guards:

| Capability | gold | silver | unknown |
|---|---|---|---|
| Master tools (A-series) | ✅ | ✅ | ✅ (with diagnostic msg) |
| Balance reports (B, D, E, G, H, I) | ✅ | ✅ | gated |
| Voucher-list tools (`tally_export_vouchers`) | ✅ | gated → use file-import | gated |
| Audit-lite voucher source | **file-import preferred; Day Book stream allowed until v0.8 filter probe** | **file-import only** | gated |
| Dashboards needing vouchers (SalesTrend, ExceptionsOverview) | ✅ | gated until file-import vouchers loaded for the period | gated |
| File-import (v0.6 `tally_import_vouchers_from_file`) | ✅ | ✅ | ✅ |

**Audit-lite source policy — explicit.** Today `runAuditLiteForCompany`
calls `getDayBookStream` on every edition; that is the same collection
family that hangs Silver. v0.7 changes the policy:

- **Silver:** `tally_run_audit_lite` requires that vouchers be loaded via
  `tally_import_vouchers_from_file` first; if no vouchers are cached, the
  tool returns a CA-friendly message telling the user how to export.
- **Gold:** `tally_run_audit_lite` continues to allow Day Book stream as a
  convenience, but **also** accepts file-imported vouchers. After the v0.8
  voucher-TDL probe, the Day Book stream call is replaced with the FILTER
  approach across both editions.
- Implementers must not "un-gate" Day Book stream on Silver after the TB
  TDL fix lands — different code path, different risk profile.

The gate message on Silver no longer says "voucher queries don't work" — it
says "voucher *list* tools need file-import on this edition; balance reports
all work." That matches what we'll actually deliver.

---

## 7. Excel template families (7 — `T1..T7`)

Each report's MCP output includes both inline JSON (for the LLM to read) and a
generated `.xlsx` file path. The Excel layout per report is one of:

| Family | Layout | Used by |
|---|---|---|
| **T1** Flat register | Cover sheet + data sheet + extraction log; freeze panes; auto-filter; INR currency format on amount columns; conditional formatting for negatives | A1–A9, B1, B2, B5–B7, D1, D8, G3, H1, I3 |
| **T2** Statement | Schedule III–style indented BS/PL with sub-totals, totals, and a Notes column; sign-off footer. **Cover sheet disclaimer: "Draft; layout is Schedule III–inspired but requires professional review for compliance use."** | B3, B4 |
| **T3** Ageing matrix | Party rows × bucket columns (0-30/31-60/61-90/91-180/180+); row totals + column totals + grand total; conditional formatting on overdue buckets | G1, G2 |
| **T4** Exception list | Code + severity + title + description + evidence + suggested fix + auditor's note column + sign-off; disclaimer footer | (used in v0.8 forensic reports) |
| **T5** Trend dashboard | Period columns (12 months) + chart sheet (line/bar); KPI cards on summary sheet | E1, I1, I6 |
| **T6** Comparison | Current vs prior period, variance amount + variance % column; conditional formatting on variance > threshold | (used in v0.8) |
| **T7** Audit working paper | Tickmark column, Auditor's Note column, Reviewer column, partner sign-off block | (used in v0.8 statutory audit) |

v0.7 uses T1, T2, T3, T5. T4, T6, T7 land in v0.8 with the forensic /
statutory / tax-audit reports.

Each template family lives in `packages/excel-engine/src/templates/<family>.ts`
as a function that takes a `WorkbookSpec`-style input + report-specific data
and returns the rendered `.xlsx` Buffer using the existing
`renderWorkbook` engine. The `toWorkbookSpec` adapter in `excel-engine` is
extended with a `family` field that picks the right template.

---

## 8. Transport changes — UTF-16 LE default

Switch `TallyHttpClient` to:

```
Content-Type: text/xml;charset=utf-16
Content-Length: Buffer.byteLength(xml, "utf16le")
Body:    Buffer.from(xml, "utf16le")
Response: chunk.toString("utf16le")
```

Tally is a native Windows app and its XML engine is empirically much happier
with UTF-16 LE (the CA's project uses it for every call). The MCP gets a
`charset: "utf-16" | "utf-8"` config knob (default `utf-16`) so any instance
that prefers UTF-8 can be flipped without code changes.

Existing `tally-xml` fixture-based parser tests stay valid — they assert on
parsed tree shape, not byte encoding.

### Transport acceptance matrix (required before locking UTF-16)

Before merging the transport switch, run this matrix on both editions:

| Request | UTF-8 | UTF-16 | Notes |
|---|---|---|---|
| List of Companies (master) | gold ✓ / silver ✓ | gold ✓ / silver ✓ | baseline |
| Trial Balance (TDL inline) | tbd | tbd | the proof point |
| Bills outstanding (collection) | tbd | tbd | bill-wise pull |
| Stock summary (collection) | tbd | tbd | inventory pull |

Each cell must be ≤5 s and return a parseable response with no `<EXCEPTION>`
body. If any cell fails on UTF-16 and passes on UTF-8, the charset knob is
the durable workaround; we do not block the rest of v0.7 on a per-cell fix.

### Legacy doc cleanup

`docs/tally-xml-notes.md` currently says "Tally defaults to ISO-8859-1;
always request UTF-8 via `<SVEXPORTFORMAT>` and `<ENCODINGTYPE>`." Update
this doc when the transport switch ships:

- TDL envelopes (the v0.7 path): UTF-16 LE in transport; do not emit
  `<ENCODINGTYPE>` since the wire encoding handles it.
- Legacy export envelopes (still present for the `tally_export_*` family
  until fully migrated): UTF-8 with `<ENCODINGTYPE>UTF8</ENCODINGTYPE>` as
  today. Acceptable for transitional period.

---

## 9. Tool surface delta (v0.6 → v0.7)

### Kept, behavior preserved (LLM sees no change)

`tally_test_connection`, `tally_list_companies`, `tally_get_company_info`,
`tally_set_default_company`, `tally_list_reports`, `tally_read_report`,
`tally_export_report_excel`, `tally_export_report_json`,
`tally_export_masters`, `tally_get_capabilities`,
`tally_import_vouchers_from_file`, `tally_config_get`,
`tally_config_update`, `tally_export_mcp_config`.

### Kept, gate removed on Silver (now fast)

`tally_get_ledger_closing_balance`, `tally_get_group_closing_balances`.

### Kept, gate kept on Silver until v0.8 voucher-TDL probe

`tally_export_vouchers`, `tally_run_audit_lite`, `tally_export_dashboard`.

### New in v0.7 (13 tools)

`tally_list_ledgers_rich`, `tally_chart_of_accounts`,
`tally_list_stock_items`, `tally_list_godowns`, `tally_list_gstins`,
`tally_trial_balance`, `tally_trial_balance_by_group`,
`tally_profit_loss_statement`, `tally_balance_sheet`,
`tally_cash_bank_balances`, `tally_turnover_44ab`,
`tally_section_43b_outstanding`, `tally_gst_output_monthly`,
`tally_receivables_ageing`, `tally_payables_ageing`,
`tally_bills_outstanding`, `tally_stock_summary`,
`tally_monthly_sales`, `tally_top_customers`, `tally_management_snapshot`.

### Tool count arithmetic

| Category | Count |
|---|---|
| v0.6 baseline (read-only) | 19 |
| New in v0.7 (above) | 20 |
| Deprecated / removed in v0.7 | 0 |
| `tally_list_ledgers` → `_rich` (coexist, both counted) | +0 |
| **Final tool count after v0.7** | **39** |

The existing `tally_read_report` dispatcher keeps its 10 reportIds — its
TrialBalance / ProfitAndLoss / BalanceSheet / LedgerMasters / GroupMasters /
VoucherTypes routes are re-backed by the new TDL templates per §5, so LLMs
that use the dispatcher continue to work without changes. All 39 tools are
read-only.

---

## 10. Migration plan — phased v0.7.0 → v0.7.4 (~3–4 weeks)

Each phase is a separately shippable patch release; each step inside a phase
is reversible by reverting one commit. **The kill-switch is v0.7.0 step 3.**

### v0.7.0 — Proof point (~3 working days)

1. **Create `packages/tdl-engine`** skeleton + nunjucks renderer + row parser
   + `runTdlReport()` orchestrator. Pure functions, fixture-tested. No
   templates yet.
2. **Transport switch** in `tally-connector` — UTF-16 LE default, `charset`
   config knob. Existing 62 `tally-xml` + 19 `tally-connector` tests stay
   green.
3. **Ship `trial-balance.xml` only** and rewire `tally_trial_balance`
   through it.
   - **Acceptance:** Returns ≥1 row in <5 s against `OM JAI JAGDISH` (FY
     22-23) on live Silver. Tally instance stays responsive after.
   - **If this fails:** ABORT v0.7. Re-design before any further work.
     Do not ship v0.7.1+ until this passes.
4. Run the transport acceptance matrix (§8) on Silver and Gold.

### v0.7.1 — Balance class (~3 working days)

5. **Rewire balance-class connectors** — B2, B3, B4, B5, B6, B7 — one
   commit per connector. Live smoke test per commit. Each must keep Tally
   responsive.
6. **Re-back `tally_read_report` dispatcher** for TrialBalance / ProfitAndLoss
   / BalanceSheet / LedgerMasters / GroupMasters / VoucherTypes routes per
   §5 mapping table.

### v0.7.2 — Masters + ageing (~2 working days)

7. **Add new master tools** — A2 (rename), A3, A5, A6, A9 — pure additions,
   no risk to existing surface.
8. **Add ageing reports** — G1, G2, G3 using `bills-outstanding.xml`. Excel
   T3 (ageing matrix) family added to `excel-engine`.

### v0.7.3 — MIS + tax/GST starters + Excel families (~3 working days)

9. **Add MIS reports** — I1 (monthly-sales, 12 sequential calls), I3
   (top-customers), I6 (management-snapshot).
10. **Add tax/GST starters** — D1, D8, E1.
11. **Add Excel T2 (statement, with draft disclaimer)** and **T5 (trend
    dashboard)** template families.

### v0.7.4 — Capability probe + docs + live checklist (~2 working days)

12. **Update capability probe** for the new tier model; remove gates on
    B5/B6; keep gates on voucher-list tools per §6 audit-lite policy.
13. **Update `tally://docs/edition-notes`** resource text.
14. **Update `docs/tally-xml-notes.md`** for the UTF-16 transport switch.
15. **Update `docs/live-tally-checklist.md`** with the 7 success-metric
    runs (§2). Run end-to-end against live Silver. Commit results.
16. **CHANGELOG entry** with reference-project attribution.

### Effort summary

| Phase | Days | Reports landed | Cumulative |
|---|---|---|---|
| v0.7.0 | 3 | 1 (TB) | 1 |
| v0.7.1 | 3 | +7 (B2–B7 + dispatcher) | 8 |
| v0.7.2 | 2 | +8 (A + G) | 16 |
| v0.7.3 | 3 | +6 (D, E, I + Excel) | 22 |
| v0.7.4 | 2 | +2 (probe + I3) | 24 |
| **Total** | **13 days** (~3–4 calendar weeks at 4 productive days/week) | **24** | — |

---

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| TDL templates work on Tally 4.x but fail on Silver in ways the CA project hides | Medium | v0.7.0 step 3 is the single proof point; if it fails, abort and re-design before committing the rest |
| UTF-16 transport breaks some Tally endpoint | Low | `charset` config knob; transport acceptance matrix (§8) before merge; per-instance fallback |
| **F01..Fn schemas drift across Tally versions** | **High over time** | (a) `report-catalog.json` carries a `catalogVersion` and per-report `minTallyVersion`; (b) **golden fixtures** captured from `OM JAI JAGDISH` plus a Gold reference, stored under `tests/fixtures/tdl/<report>/`; (c) **parser tests fail loudly** when column count mismatches the schema (no silent zero-fill) |
| **`trial-balance.xml` regression blast radius** — one template drives B1/B2/B5/B6/B7/D1/D8/I3/I1 | **High** | Per-consumer fixture tests: each downstream report (B2, B5, B6, D1, etc.) has its own integration test asserting the TB row shape it relies on. CI rejects PRs that change `trial-balance.xml` without updating fixtures. |
| Schedule III mapping JSON drifts from real Tally group names | High over time | Mapping is config; ship sane defaults; surface "unmapped groups" in Schedule III output. (Ships in v0.8, not v0.7.) |
| Filtered Voucher TDL (v0.8) is slow on Silver | Medium-high | Empirical probe before committing v0.8; fall back to file-import + client-side filter |
| Excel template families balloon in complexity | Medium | T1 covers the majority; T2/T3/T5 are well-defined; T4/T6/T7 deferred to v0.8 |
| Two Tally instances return different `STATIC` schemas | Low | Capability probe per-instance; report-catalog defines projection; field-name drift surfaces as fixture mismatch |
| **Nunjucks + angular substitution mis-ordering** | Low-medium | §4 locks the order (nunjucks first, angular second); one explicit edge-case test for a company name containing `{{`, `}}`, and `<nunjuck>` (§12) |

---

## 12. Testing strategy

| Layer | Tests | When |
|---|---|---|
| Unit (nunjucks renderer) | Snapshot per template with fixture params; fuzz with `&`/`<`/`"` in company name; **edge-case test for company name containing `{{`, `}}`, `<nunjuck>`** | Per template added |
| Unit (row parser) | Each `datatype` (string/number/boolean/date/quantity/array) with fixture XML; **fail-loud when column count mismatches schema** | Per parser change |
| Integration (tdl-engine + report-engine adapter) | Mock `TallyClient.post`, canned XML response, assert typed rows | Per connector rewired |
| **Per-consumer fixtures for shared templates** | `trial-balance.xml` has separate fixture tests for B2 (group filter), B5 (single ledger), B6 (group rollup), D1 (Sales group), D8 (statutory dues groups), I3 (top customers) — CI rejects PRs that change the template without updating all consumer fixtures | Per shared-template change |
| **Golden fixtures from live Tally** | Captured from `OM JAI JAGDISH` (Silver) and a Gold reference book; stored under `tests/fixtures/tdl/<report>/silver.xml` and `gold.xml` | Captured during v0.7.0; refreshed when minTallyVersion bumps |
| Excel template smoke | Render each template, re-load .xlsx, assert sheet names + row counts + INR format on amount columns | Per template family |
| **C-R1 enforcement** | CI grep test: `tdl-engine/templates/**/*.xml` must not contain `TALLYREQUEST>Import`, `ACTION="Alter"`, `ACTION="Create"`, or `TAGNAME="MASTER ID"`. Fail the build if any match. | Every CI run |
| **Charset matrix** | UTF-8 vs UTF-16 on List of Companies, TB, bills-outstanding, stock-summary; both Silver and Gold | Once during v0.7.0; re-run if `charset` config default changes |
| Live Silver | v0.7.0 step 3 proof point; then once per phase ship | Manual checklist in `docs/live-tally-checklist.md` |
| MCP integration | In-process Client+Server pair; capability probe skipped (test flag) | Per tool added |

**Coverage target:** ≥80% per `docs/definition-of-done.md` on every package
touched.

---

## 13. Phase backlog (v0.8 → v1.0)

Full 73-report catalog (see appendix). Phase grouping:

| Phase | Reports | Theme | Effort |
|---|---|---|---|
| **v0.7** (this spec) | 24 | Masters + TB/P&L/BS + ageing + headline MIS + tax/GST starters | ~2 weeks |
| **v0.8** | 30 | Full Statutory + Tax Audit + GST + Forensic anomaly checks (filtered vouchers gated on probe) | ~4 weeks |
| **v0.9** | 12 | Stock valuation, GSTR mismatch, dormant/after-hours red flags, niche compliance | ~2 weeks |
| **v1.0** | 7 | Depreciation IT Act, same-day round-trip detector, multi-company consolidation hooks | ~3 weeks |

v0.8 is gated on a single empirical question: **does filtered Voucher TDL
return in <10 s on Silver?** If yes, the 20 🟡 reports ship as designed.
If no, those reports become "load via `tally_import_vouchers_from_file` then
filter client-side" — slightly worse UX (user runs the Tally UI export
first) but functionally equivalent.

---

## 14. Open questions — resolved

| Q | Decision |
|---|---|
| SQL mirror vs TDL engine? | TDL engine. SQL mirror parked indefinitely. |
| UTF-16 default? | Yes. Knob to fall back to UTF-8. |
| Voucher list on Silver? | File-import path stays (v0.6). XML voucher list not viable. |
| Schedule III mapping editor? | JSON config in v0.7. UI deferred to v1.0+. |
| Drop existing v0.5 tools? | No. Rename/redirect transparently via dispatcher. |
| Day Book / Sales Register live readers? | Deferred — file-import is the durable path. |
| Capability probe behavior on Silver? | Mid-tier ("balance-OK, voucher-list-disabled"). |

---

## 15. Appendix: full 73-report catalog

TDL strategy: 🟢 balance / 🟡 filtered-voucher (Silver-perf unknown) /
🔴 composite (multiple pulls + client-side composition).
Excel: T1 register / T2 statement / T3 ageing / T4 exception list / T5 trend /
T6 comparison / T7 working paper.

### A. Masters & chart of accounts (9 — all 🟢)

| ID | Report | TDL | Excel | Phase |
|---|---|---|---|---|
| A1 | list-companies | 🟢 | T1 | v0.7 |
| A2 | list-ledgers-rich | 🟢 | T1 | v0.7 |
| A3 | chart-of-accounts | 🟢 | T1 | v0.7 |
| A4 | list-voucher-types | 🟢 | T1 | v0.7 |
| A5 | list-stock-items | 🟢 | T1 | v0.7 |
| A6 | list-godowns | 🟢 | T1 | v0.7 |
| A7 | list-cost-centres | 🟢 | T1 | v0.8 |
| A8 | list-currencies | 🟢 | T1 | v0.8 |
| A9 | list-gstins | 🟢 | T1 | v0.7 |

### B. Trial Balance / P&L / Balance Sheet (7 — all 🟢)

| ID | Report | TDL | Excel | Phase |
|---|---|---|---|---|
| B1 | trial-balance | 🟢 | T1 | v0.7 |
| B2 | trial-balance-by-group | 🟢 | T1 | v0.7 |
| B3 | profit-loss-statement | 🟢 | T2 | v0.7 |
| B4 | balance-sheet | 🟢 | T2 | v0.7 |
| B5 | ledger-closing-balance | 🟢 | inline | v0.7 |
| B6 | group-closing-balances | 🟢 | T1 | v0.7 |
| B7 | cash-bank-balances | 🟢 | T1 | v0.7 |

### C. Statutory Audit / Schedule III (8)

| ID | Report | TDL | Excel | Phase |
|---|---|---|---|---|
| C1 | schedule3-balance-sheet | 🔴 | T2 | v0.8 |
| C2 | schedule3-profit-loss | 🔴 | T2 | v0.8 |
| C3 | cash-flow-indirect | 🔴 | T2 | v0.8 |
| C4 | fixed-asset-register | 🔴 | T1 | v0.8 |
| C5 | loans-given-received | 🟢 | T1 | v0.8 |
| C6 | investments-summary | 🟢 | T1 | v0.8 |
| C7 | auditor-remuneration | 🟢 | T1 | v0.8 |
| C8 | msme-outstanding-45-90d | 🔴 | T3 | v0.8 |

### D. Tax Audit / Form 3CD (10)

| ID | Report | 3CD Cl. | TDL | Excel | Phase |
|---|---|---|---|---|---|
| D1 | turnover-44AB | 40 | 🟢 | T1 | v0.7 |
| D2 | cash-payments-40A3 | 21(d) | 🟡 | T4 | v0.8 |
| D3 | cash-receipts-269ST | 31 | 🟡 | T4 | v0.8 |
| D4 | loans-deposits-269SS | 31(a) | 🟡 | T4 | v0.8 |
| D5 | loans-repaid-269T | 31(b) | 🟡 | T4 | v0.8 |
| D6 | tds-deducted-monthly | 34 | 🟢 | T5 | v0.8 |
| D7 | tds-paid-vs-deducted | 34 | 🟢 | T6 | v0.8 |
| D8 | section-43B-outstanding | 26 | 🟢 | T1 | v0.7 |
| D9 | personal-expenses-cl21a | 21(a) | 🟢 | T1 | v0.8 |
| D10 | depreciation-it-act | 18 | 🔴 | T1 | v1.0 |

### E. GST audit (7)

| ID | Report | TDL | Excel | Phase |
|---|---|---|---|---|
| E1 | gst-output-monthly | 🟢 | T5 | v0.7 |
| E2 | gst-input-monthly | 🟢 | T5 | v0.8 |
| E3 | gstr3b-derivation | 🔴 | T2 | v0.8 |
| E4 | rcm-payable-summary | 🟢 | T1 | v0.8 |
| E5 | hsn-wise-sales | 🟡 | T1 | v0.9 |
| E6 | gst-mismatch-summary | 🔴 | T6 | v0.9 |
| E7 | b2b-invoices-list | 🟡 | T1 | v0.9 |

### F. Forensic / Red flags (12 — all 🟡; gated on v0.8 voucher-TDL probe)

| ID | Report | Excel | Phase |
|---|---|---|---|
| F1 | round-figure-vouchers | T4 | v0.8 |
| F2 | large-journal-entries | T4 | v0.8 |
| F3 | backdated-entries | T4 | v0.8 |
| F4 | weekend-entries | T4 | v0.8 |
| F5 | after-hours-entries | T4 | v0.9 |
| F6 | late-modified-vouchers | T4 | v0.8 |
| F7 | duplicate-voucher-numbers | T4 | v0.8 |
| F8 | dormant-then-active | T4 | v0.9 |
| F9 | top-N-largest-vouchers | T4 | v0.8 |
| F10 | vendor-concentration (🟢) | T6 | v0.8 |
| F11 | customer-concentration (🟢) | T6 | v0.8 |
| F12 | same-day-round-trip | T4 | v1.0 |

### G. Ageing & receivables/payables (4 — all 🟢)

| ID | Report | Excel | Phase |
|---|---|---|---|
| G1 | receivables-ageing | T3 | v0.7 |
| G2 | payables-ageing | T3 | v0.7 |
| G3 | bills-outstanding | T1 | v0.7 |
| G4 | top-overdue-bills | T1 | v0.8 |

### H. Inventory (5)

| ID | Report | TDL | Excel | Phase |
|---|---|---|---|---|
| H1 | stock-summary | 🟢 | T1 | v0.7 |
| H2 | stock-by-godown | 🟢 | T1 | v0.8 |
| H3 | negative-stock | 🟢 | T4 | v0.8 |
| H4 | slow-moving | 🟢 | T4 | v0.8 |
| H5 | stock-valuation-summary | 🟢 | T1 | v0.9 |

### I. MIS / Management (6 — all 🟢)

| ID | Report | Excel | Phase |
|---|---|---|---|
| I1 | monthly-sales | T5 | v0.7 |
| I2 | monthly-purchase | T5 | v0.8 |
| I3 | top-customers | T1 | v0.7 |
| I4 | top-vendors | T1 | v0.8 |
| I5 | daily-cash-position | T5 | v0.8 |
| I6 | management-snapshot | T5 | v0.7 |

### J. Compliance registers (5 — all 🟢)

| ID | Report | Excel | Phase |
|---|---|---|---|
| J1 | tds-register | T1 | v0.8 |
| J2 | tcs-register | T1 | v0.9 |
| J3 | professional-tax-register | T1 | v0.9 |
| J4 | pf-esi-register | T1 | v0.9 |
| J5 | e-invoice-applicability | T1 | v0.9 |

**Totals:** 73 reports across 10 areas. v0.7 = 24; v0.8 = 30; v0.9 = 12; v1.0 = 7.

---

---

## 16. Revision history

| Version | Date | Change |
|---|---|---|
| 1.1 | 2026-05-24 | Review feedback applied: §0 submission-plan relationship, §2 success metrics, §4 nunjucks/angular substitution order + edge-case test, §5 tally_read_report mapping table + tally_list_ledgers deprecation, §6 explicit audit-lite voucher source policy per edition, §7 T2 draft disclaimer, §8 transport acceptance matrix + tally-xml-notes.md update plan, §9 tool count baseline table, §10 phased v0.7.0–v0.7.4 (~13 days), §11 F01..Fn drift + TB regression blast radius + nunjucks ordering risks, §12 per-consumer fixtures + golden fixtures + C-R1 grep + charset matrix |
| 1.0 | 2026-05-24 | Initial design after brainstorming approval |

---

*End of design — TallyMCP v0.7 TDL engine.*
