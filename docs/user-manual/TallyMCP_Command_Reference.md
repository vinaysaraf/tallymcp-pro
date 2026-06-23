# TallyMCP Pro — AI Command Reference

A quick guide to what you can ask the AI to do with your TallyPrime data. You talk to your AI assistant (Claude Desktop, Cursor, LM Studio, Ollama) in plain English — it maps your request to the right TallyMCP tool. **Everything is read-only: TallyMCP never writes to or changes your Tally data.**

---

## 1. Guided prompts — the built-in shortcuts

In **Claude Desktop**, click the **➕** button → choose the **TallyMCP** connector → pick one of these guided workflows:

| Prompt | What it does |
|---|---|
| **config** | First-time setup — tests the Tally connection and sets your default company |
| **read** | Fetch one of the 10 standard reports (and optionally save to Excel) |
| **export** | Bulk-export masters (ledgers/groups) or vouchers to disk |
| **audit** | Run the 18-check books health-check and get an explainable Books Score (0–100) |
| **dashboard** | Generate a formatted Excel dashboard |
| **help** | Overview of capabilities and prerequisites |

---

## 2. Just ask in plain English

You don't need to know tool names — type naturally. Examples:

| You say | What happens |
|---|---|
| "Is Tally connected?" | Runs a connection diagnostic |
| "List my companies" | Shows all companies loaded in Tally |
| "Use ABC Pvt Ltd as my default company" | Sets the default company for later questions |
| "Show me the Trial Balance for FY 2025-26" | Fetches and summarises the Trial Balance |
| "Export the Profit & Loss and Balance Sheet to Excel" | Saves formatted workbooks and gives you the file paths |
| "What were my total sales this year?" | Sums the Sales Accounts group balance |
| "What's the closing balance of the Cash ledger?" | Returns that ledger's closing balance |
| "Run a health-check on the books and list the top risks" | Runs audit-lite and explains the findings + Books Score |
| "Give me a management dashboard" | Produces the Management Snapshot Excel dashboard |
| "Export all ledgers and groups" | Exports masters as Excel + CSV |
| "What can this edition of Tally do?" | Reports what's supported on your Tally edition |

---

## 3. The 10 standard reports

List of Companies · Company Info · Ledger Masters · Group Masters · Voucher Types · Day Book · Trial Balance · Profit & Loss · Balance Sheet · Sales Register

Each can be **read in chat** or **exported to Excel/JSON**. Just name the report and period (defaults to the current Indian financial year).

---

## 4. The 3 Excel dashboards

- **Management Snapshot** — overall financial summary
- **Sales Trend** — period-over-period sales
- **Exceptions Overview** — transactions flagged by the audit checks

---

## 5. Good to know

- **Prerequisites:** TallyPrime must be running with a company loaded and the XML interface ON (Gateway of Tally → F1 Help → Settings → Connectivity → Client/Server → **Both**, port **9000**). The Configurator's *Fix* button can set this up for you.
- **TallyPrime Silver:** voucher / balance / audit features are slow on Silver and are turned off by default. Either ask the AI to enable them anyway (for small books), or export the Day Book to XML (Display → Day Book → E: Export → XML) and import that for the audit.
- **Where files are saved:** generated Excel/CSV/JSON files are written to a folder under your user profile. You can ask the AI to "set my output folder to C:\TallyMCP" to choose your own.
- **Your data stays local:** TallyMCP only talks to your local Tally. (Note: the AI assistant you use will send the specific report content you choose to share to its own provider for processing — choose your AI client accordingly for confidential data.)

---

*TallyMCP Pro — read-only AI access to TallyPrime, for Chartered Accountants and finance teams.*
