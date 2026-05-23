# TallyMCP Pro — 5-minute demo script

This script walks an evaluator through the headline AI integration. Each step
matches a single MCP tool call (or LLM prompt) you should be able to perform
end-to-end in under five minutes.

## 0. Setup (off-screen, ~30s)

1. Open **TallyPrime** with a real company loaded.
2. F1 → Settings → Connectivity → Client/Server → **Both**, port **9000**.
3. In **Cursor** (or Claude Desktop), confirm the `tallymcp-pro` MCP server is
   connected — see [`mcp-client-setup.md`](./mcp-client-setup.md).

## 1. Connect (~30s)

> Prompt the assistant: *"Test the Tally connection and tell me how many companies are loaded."*

The model calls `tally_test_connection`. Expected output (live Tally):
`{ ok: true, code: "OK", companiesLoaded: N, productVersion: "..." }`.

The model summarises the diagnostic in plain English.

## 2. List + select a company (~30s)

> *"List the companies and set my Acme company as the default."*

`tally_list_companies` returns the company array; the model offers you the
choice; on confirmation it calls `tally_set_default_company`.

## 3. Read a Trial Balance (~60s)

> *"Show me the Trial Balance for this FY and give me the highlights."*

The model calls `tally_read_report { reportId: "TrialBalance" }`. With no
dates, the server resolves the current Indian FY from the company's
`startingFrom` (Apr 1–Mar 31). The model receives the rows inline as JSON and
summarises them.

## 4. Export the same report to Excel (~30s)

> *"Save that as a workbook I can open in Excel."*

`tally_export_report_excel { reportId: "TrialBalance" }`. Open the file in
Excel — note the Cover sheet (company, period, generated-at, optional
disclaimer), the Trial Balance sheet with the Indian currency format
(`#,##,##0.00`), frozen headers, and auto-filter.

## 5. Run audit-lite — the AI-flagship step (~60s)

> *"Run the audit-lite checks and explain the top findings in plain English."*

`tally_run_audit_lite`. The tool returns the full `AuditLiteResult` JSON
**inline** — not just a path — so the model can quote individual findings,
their severity, evidence, and suggested fix. The model also reports the
**books score** (0–100) with its explainable component breakdown.

Show the Excel workbook from `workbookPath` as the human-readable backup.

## 6. Dashboard (~30s)

> *"Render the Management Snapshot dashboard."*

`tally_export_dashboard { kind: "ManagementSnapshot" }`. Open the workbook to
see the Summary, Trial Balance, and P&L sheets in one place.

## 7. Closing statement (~10s)

> Read-only — no data was written back to Tally. Future versions add safe
> write (templates → validate → preview → approve → post), GST/bank
> reconciliation, and natural-language queries.

## What to point out

- **All findings reached the model as JSON**, not just a file path. The
  evaluator can see how the AI integrates with a domain-specific tool.
- **The Excel workbooks are CA-grade**: Indian currency, freeze panes,
  auto-filter, cover sheet with disclaimer for audit outputs.
- **The cover-sheet disclaimer** ("Analytical support only — not a statutory
  audit opinion") is mandatory on audit-lite exports.
- **Network egress is gated**: the in-built `NetworkGuard` rejects any URL
  that is not the configured Tally host:port.
