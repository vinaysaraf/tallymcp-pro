# TallyMCP Pro — User Manual (Non‑technical)

**Version:** v1.0.10  
**Audience:** Chartered Accountants, accountants, finance teams  
**Goal:** Read Tally data safely and export professional reports (no posting)

---

## Quick start (1 minute)

### Step A — Confirm Tally is ready

1. Open **TallyPrime**
2. **Load the company** you want to work with
3. In TallyPrime:
   - **F1 (Help) → Settings → Connectivity → Client/Server Configuration**
   - Set to **Both**
   - Port **9000**

### Step B — Confirm TallyMCP is ready

Open **TallyMCP Configurator** and confirm:
- **Tally connected** (green dot)
- **MCP server running** (green dot)

If you see any red/yellow warnings, open **Health Check** and click **Re-check**.

---

## How to use TallyMCP in Claude Desktop / Cursor

You will type normal questions, but these **starter commands** work best:

- **`/config`** — first-time setup, connection test, choose company
- **`/read`** — read a report inside chat (Trial Balance, P&L, etc.)
- **`/export`** — export an Excel/JSON file (for working papers)
- **`/audit`** — audit-lite checks + findings + workbook
- **`/dashboard`** — management dashboards (Excel)

Tip: If you are unsure, start with **`/config`**.

---

## 1) First-time setup (`/config`)

Copy-paste this prompt:

**`/config`**  
“Set up TallyMCP for me. First test the connection. Then show the list of companies and ask me which company to set as default.”

What happens next:
- The assistant runs a connection test
- It lists companies available in Tally
- You choose one company as the **default**

---

## 2) Read reports inside chat (`/read`)

Use this template:

**`/read`**  
“Read **<Report Name>** for **<Company>** for period **<FromDate> to <ToDate>**. If I don’t give dates, use current financial year.”

### Common examples (copy-paste)

**Trial Balance (current FY)**

`/read` “Trial Balance for my default company.”

**Profit & Loss (FY 2025–26)**

`/read` “Profit & Loss from 20250401 to 20260331.”

**Balance Sheet (as on 31‑03‑2026)**

`/read` “Balance Sheet as on 20260331.”

**Sales Register (April 2025)**

`/read` “Sales Register from 20250401 to 20250430.”

**Purchase Register (April 2025)**

`/read` “Purchase Register from 20250401 to 20250430.”

---

## 3) Export to Excel / JSON (`/export`)

Use this template:

**`/export`**  
“Export **<Report Name>** for **<period>** to **Excel** and give me the file.”

### Common examples (copy-paste)

**Export Trial Balance to Excel**

`/export` “Export Trial Balance to Excel for 20250401 to 20260331.”

**Export Profit & Loss to Excel**

`/export` “Export Profit & Loss to Excel for 20250401 to 20260331.”

**Export Balance Sheet to Excel**

`/export` “Export Balance Sheet to Excel as on 20260331.”

**Export Masters (Ledgers / Groups / Voucher Types)**

`/export` “Export Masters to Excel for my default company.”

What you get:
- A file path to a generated **Excel workbook** (and sometimes a JSON export option)

---

## 4) Audit-lite (`/audit`)

Audit-lite is **analytical support only**. It highlights **risk indicators** and suggests checks.
It is **not** a statutory audit opinion.

Copy-paste this prompt:

**`/audit`**  
“Run audit-lite for my default company for 20250401 to 20260331. Summarize findings by severity and give me the Excel working paper.”

What you get:
- Findings (what looks wrong + why it matters)
- Suggested audit procedures
- Excel working paper path

---

## 5) Dashboards (Excel) (`/dashboard`)

Dashboards are Excel files. Available kinds:
- **ManagementSnapshot**
- **SalesTrend**
- **ExceptionsOverview**

Copy-paste examples:

`/dashboard` “Generate ManagementSnapshot for 20250401 to 20260331 and give me the Excel file.”

`/dashboard` “Generate SalesTrend for 20250401 to 20260331 and give me the Excel file.”

`/dashboard` “Generate ExceptionsOverview for 20250401 to 20260331 and give me the Excel file.”

---

## Common problems and quick fixes

### A) “Tally not reachable” / “Port refused”

1. Keep TallyPrime open and load the company
2. Check: **Connectivity → Both**, Port **9000**
3. In Configurator → **Health Check → Re-check**

### B) “Firewall rule missing”

- If AI client and Tally are on the **same PC**, it often still works
- If AI client is on a **different PC** (LAN), the firewall rule must be added
- Fix: Run Configurator as **Administrator** → Health Check → **Fix both**

### C) Tally becomes slow or hangs

- Do not run heavy exports from **Claude and Cursor at the same time**
- Start with smaller reports first (Trial Balance / Company Info)
- If it still hangs: close the AI client, restart TallyPrime, try again

---

## Recommended daily workflow

1. `/config` once (set default company)
2. `/read` to check numbers quickly
3. `/export` when you need Excel for working papers
4. `/audit` for exception-based review
5. `/dashboard` for management reporting

