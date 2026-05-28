import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diagnoseTally } from "@tallymcp/tally-connector";
import {
  getCompanyInfo,
  getGroupClosingBalances,
  getLedgerClosingBalance,
  listCompanies,
  resolvePeriod,
  runReport,
} from "@tallymcp/report-engine";
import { exportMasters, exportReport, exportVouchers } from "@tallymcp/output-store";
import { ReportIdSchema, TallyDateSchema } from "@tallymcp/shared-types";
import { exportMcpClientConfig } from "./client-config.js";
import type { McpContext } from "./context.js";
import { redactConfig } from "./context.js";
import { REPORT_DESCRIPTORS } from "./report-descriptors.js";

const TEXT = (text: string) => ({ content: [{ type: "text" as const, text }] });

const jsonResult = (value: unknown) => TEXT(JSON.stringify(value, null, 2));

const errorResult = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  return { ...TEXT(`Error: ${message}`), isError: true };
};

const PERIOD_OPTIONAL = {
  fromDate: TallyDateSchema.optional().describe("Period start (YYYYMMDD). Defaults to current Indian FY."),
  toDate: TallyDateSchema.optional().describe("Period end (YYYYMMDD)."),
};

/**
 * Refuses voucher / closing-balance / audit-lite work when the boot-time
 * capability probe found Tally to be Silver-class (or unreachable). Returning
 * `null` means "proceed"; otherwise the returned object is an MCP error
 * result to bail out with.
 *
 * Override: set `config.tally.unsafeSlow=true` (e.g., on a small Silver book).
 */
function gateOnVouchers(ctx: McpContext): null | ReturnType<typeof errorResult> {
  if (ctx.config.tally.unsafeSlow) return null;
  if (ctx.capabilities.voucherQueriesViable) return null;
  return errorResult(
    new Error(
      `Voucher / balance / audit tools are disabled on this Tally instance (edition=${ctx.capabilities.edition}). ${ctx.capabilities.message} Either (a) export from Tally UI and call tally_import_vouchers_from_file, or (b) set config tally.unsafeSlow=true to attempt anyway.`,
    ),
  );
}

/**
 * Registers the full read-only tool/prompt/resource catalogue on `server`.
 * No write/post/alter tool is ever registered (constraint C-R1, C-R2).
 */
export function registerTallyMcp(server: McpServer, ctx: McpContext): void {
  registerTools(server, ctx);
  registerPrompts(server, ctx);
  registerResources(server, ctx);
}

function registerTools(server: McpServer, ctx: McpContext): void {
  // 1. tally_test_connection
  server.tool(
    "tally_test_connection",
    "Diagnose the Tally HTTP XML connection. Returns ok/fail + actionable hints.",
    {},
    async () => {
      try {
        const diag = await diagnoseTally(ctx.tallyClient);
        return jsonResult(diag);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 2. tally_list_companies
  server.tool(
    "tally_list_companies",
    "List all companies known to Tally.",
    {},
    async () => {
      try {
        return jsonResult(await listCompanies(ctx.tallyClient));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 3. tally_get_company_info
  server.tool(
    "tally_get_company_info",
    "Get metadata (FY start, GSTIN, base currency) for a loaded company.",
    {
      company: z.string().optional().describe("Company name; defaults to config.tally.defaultCompany."),
    },
    async ({ company }) => {
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        return jsonResult(await getCompanyInfo(ctx.tallyClient, { company: target }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 4. tally_set_default_company
  server.tool(
    "tally_set_default_company",
    "Set the default company for subsequent calls. Persists to config.",
    {
      company: z.string().min(1),
    },
    async ({ company }) => {
      try {
        await ctx.configStore.update({ tally: { defaultCompany: company } });
        return jsonResult({ ok: true, defaultCompany: company });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 5. tally_list_reports
  server.tool(
    "tally_list_reports",
    "List the 10 read reports supported by this server.",
    {},
    async () => jsonResult(REPORT_DESCRIPTORS),
  );

  // 6. tally_read_report
  server.tool(
    "tally_read_report",
    "Run a Tally report and return the rows inline as JSON.",
    {
      reportId: ReportIdSchema,
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async (input) => {
      try {
        const result = await runReport(
          ctx.tallyClient,
          {
            reportId: input.reportId,
            company: input.company ?? ctx.config.tally.defaultCompany,
            fromDate: input.fromDate,
            toDate: input.toDate,
          },
          {
            defaultFinancialYear: ctx.config.tally.defaultFinancialYear,
          },
        );
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 7. tally_export_report_excel
  server.tool(
    "tally_export_report_excel",
    "Run a report and persist it as an Excel workbook. Returns the file path.",
    {
      reportId: ReportIdSchema,
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async (input) => {
      try {
        const result = await runReport(
          ctx.tallyClient,
          {
            reportId: input.reportId,
            company: input.company ?? ctx.config.tally.defaultCompany,
            fromDate: input.fromDate,
            toDate: input.toDate,
          },
          { defaultFinancialYear: ctx.config.tally.defaultFinancialYear },
        );
        const file = await exportReport(result, { format: "excel", outputDir: ctx.outputDir });
        return jsonResult(file);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 8. tally_export_report_json
  server.tool(
    "tally_export_report_json",
    "Run a report and persist it as JSON. Returns the file path.",
    {
      reportId: ReportIdSchema,
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async (input) => {
      try {
        const result = await runReport(
          ctx.tallyClient,
          {
            reportId: input.reportId,
            company: input.company ?? ctx.config.tally.defaultCompany,
            fromDate: input.fromDate,
            toDate: input.toDate,
          },
          { defaultFinancialYear: ctx.config.tally.defaultFinancialYear },
        );
        const file = await exportReport(result, { format: "json", outputDir: ctx.outputDir });
        return jsonResult(file);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 9. tally_export_masters
  server.tool(
    "tally_export_masters",
    "Export all masters (ledgers, groups, voucher types) as a multi-sheet xlsx plus per-master CSVs.",
    {
      company: z.string().optional(),
    },
    async ({ company }) => {
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        return jsonResult(
          await exportMasters(ctx.tallyClient, { company: target, outputDir: ctx.outputDir }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 10. tally_export_vouchers (gated: voucher-class)
  server.tool(
    "tally_export_vouchers",
    "Stream the Day Book for a period to a single CSV (memory-safe). Requires Tally edition that can serve voucher collections — see tally_get_capabilities.",
    {
      company: z.string().optional(),
      fromDate: TallyDateSchema,
      toDate: TallyDateSchema,
    },
    async ({ company, fromDate, toDate }) => {
      const gate = gateOnVouchers(ctx);
      if (gate) return gate;
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        const file = await exportVouchers(ctx.tallyClient, {
          company: target,
          fromDate,
          toDate,
          outputDir: ctx.outputDir,
        });
        return jsonResult(file);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 11a. tally_get_ledger_closing_balance — single-ledger ClosingBalance (gated)
  server.tool(
    "tally_get_ledger_closing_balance",
    "Get the closing balance for a single named ledger over a period. Works on TallyPrime 4.x; gated off on Silver (see tally_get_capabilities). Override: config tally.unsafeSlow=true.",
    {
      ledger: z.string().min(1).describe("Exact ledger name as in Tally."),
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ ledger, company, fromDate, toDate }) => {
      const gate = gateOnVouchers(ctx);
      if (gate) return gate;
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        const period = resolvePeriod(undefined, {
          fromDate,
          toDate,
          defaultFinancialYear: ctx.config.tally.defaultFinancialYear,
        });
        const balance = await getLedgerClosingBalance(ctx.tallyClient, {
          company: target,
          ledger,
          fromDate: period.from,
          toDate: period.to,
        });
        return jsonResult({ ...balance, period });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 11b. tally_get_group_closing_balances — sum of closing balances under a group (gated)
  server.tool(
    "tally_get_group_closing_balances",
    "Sum closing balances across every ledger whose parent group matches groupName (e.g., 'Sales Accounts' for the sales figure). Per-ledger breakdown + total. Gated on Silver — same as tally_get_ledger_closing_balance.",
    {
      groupName: z
        .string()
        .min(1)
        .describe("Exact Tally group name, e.g. 'Sales Accounts', 'Purchase Accounts', 'Direct Incomes'."),
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ groupName, company, fromDate, toDate }) => {
      const gate = gateOnVouchers(ctx);
      if (gate) return gate;
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        const period = resolvePeriod(undefined, {
          fromDate,
          toDate,
          defaultFinancialYear: ctx.config.tally.defaultFinancialYear,
        });
        const result = await getGroupClosingBalances(ctx.tallyClient, {
          company: target,
          groupName,
          fromDate: period.from,
          toDate: period.to,
        });
        return jsonResult({ ...result, period });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 12. tally_run_audit_lite — wired in S4.3 (gated: needs voucher data)
  server.tool(
    "tally_run_audit_lite",
    "Run the 18 rule-based audit-lite checks against the company books and return findings + books score. Requires voucher-viable Tally — gated off on Silver; use tally_import_vouchers_from_file first.",
    {
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ company, fromDate, toDate }) => {
      const gate = gateOnVouchers(ctx);
      if (gate) return gate;
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        const { runAuditLiteForCompany } = await import("./audit.js");
        return jsonResult(
          await runAuditLiteForCompany(ctx, { company: target, fromDate, toDate }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 13. tally_export_dashboard — wired in S4.3 (gated: pulls TB/PL/BS/vouchers)
  server.tool(
    "tally_export_dashboard",
    "Render one of the 3 Excel dashboards (ManagementSnapshot, SalesTrend, ExceptionsOverview). Gated on Silver.",
    {
      kind: z.enum(["ManagementSnapshot", "SalesTrend", "ExceptionsOverview"]),
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ kind, company, fromDate, toDate }) => {
      const gate = gateOnVouchers(ctx);
      if (gate) return gate;
      try {
        const target = company ?? ctx.config.tally.defaultCompany;
        if (!target) return errorResult(new Error("No company supplied and no defaultCompany configured."));
        const { exportDashboardForCompany } = await import("./dashboards.js");
        return jsonResult(
          await exportDashboardForCompany(ctx, { kind, company: target, fromDate, toDate }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 13. tally_config_get
  server.tool(
    "tally_config_get",
    "Read the current configuration (with secrets redacted).",
    {},
    async () => jsonResult(redactConfig(ctx.config)),
  );

  // 14. tally_config_update
  server.tool(
    "tally_config_update",
    "Merge a partial patch into the config and persist it. Refreshes the connection client.",
    {
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ patch }) => {
      try {
        const next = await ctx.configStore.update(patch as never);
        await ctx.refresh();
        return jsonResult(redactConfig(next));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 16. tally_get_capabilities — what this Tally instance can and can't serve
  server.tool(
    "tally_get_capabilities",
    "Returns the boot-time capability probe: edition (silver/gold/unknown), whether voucher / balance / audit tools are viable on this Tally, and a human-readable explanation. The LLM should read this BEFORE attempting voucher-class work.",
    {},
    async () => jsonResult(ctx.capabilities),
  );

  // 17. tally_import_vouchers_from_file — Silver-class workaround
  server.tool(
    "tally_import_vouchers_from_file",
    "Parse a voucher dump exported from Tally UI (Display → Day Book → E: Export → XML) — the cross-edition workaround when live voucher collections aren't viable. Accepts .xml (Tally export) or .json (Voucher[] array). Returns the parsed Voucher list.",
    {
      filePath: z.string().min(1).describe("Absolute or working-directory-relative path to an XML or JSON file."),
    },
    async ({ filePath }) => {
      try {
        const { importVouchersFromFile } = await import("./voucher-import.js");
        const vouchers = await importVouchersFromFile(filePath);
        return jsonResult({
          source: filePath,
          count: vouchers.length,
          vouchers,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // 18. tally_export_mcp_config
  server.tool(
    "tally_export_mcp_config",
    "Emit a copy-pasteable MCP client config snippet for Claude Desktop, Cursor, LM Studio, or Ollama.",
    {
      client: z.enum(["cursor", "claude-desktop", "lm-studio", "ollama"]),
      serverEntry: z.string().optional().describe("Override the MCP server entry path. Defaults to the running server's own path — main.bundle.js when installed, dist/main.js in a dev checkout."),
    },
    async ({ client, serverEntry }) => {
      try {
        // Default to the server's OWN running entry (process.argv[1]) so the
        // emitted snippet points at wherever this server actually lives:
        // <installDir>\mcp-server\main.bundle.js when installed, or the dev
        // dist/main.js in a checkout. The old hardcoded "dist/main.js" default
        // generated a broken path for installed v1.0.5 users (no dist/ subdir;
        // Cursor PR #12 review). The final literal is a last-resort fallback.
        const entry =
          serverEntry ?? process.env.TALLYMCP_SERVER_ENTRY ?? process.argv[1] ?? "main.bundle.js";
        return jsonResult(
          exportMcpClientConfig({
            client,
            serverEntry: entry,
            configPath: ctx.configStore.filePath,
          }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

export function registerPrompts(server: McpServer, _ctx: McpContext): void {
  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "config",
    "First-time setup overview: test the Tally connection and select a default company.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP setup overview. " +
              "This MCP server provides tools for connecting Claude to a TallyPrime instance. " +
              "Tools relevant for first-time setup: " +
              "`tally_test_connection` verifies that Tally is running and reachable on localhost:9000 — it returns a diagnostic object with an `ok` flag and, on failure, a `hint` describing the likely fix. " +
              "`tally_list_companies` returns the companies currently loaded in Tally. " +
              "`tally_set_default_company` configures which company future queries should target by default. " +
              "A typical first-run sequence uses these three tools in order; the user invokes each tool when ready.",
          },
        },
      ],
    }),
  );

  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "read",
    "Guide for reading one of the 10 available reports and optionally exporting to Excel.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP read-report guide. " +
              "`tally_list_reports` returns the 10 available report descriptors (name, reportId, description). " +
              "Once the user selects a report, company, and period (default: current Indian FY), " +
              "`tally_read_report` fetches the data and returns a structured row set that can be summarised in plain English. " +
              "`tally_export_report_excel` accepts the same parameters and saves a formatted workbook, returning the file path.",
          },
        },
      ],
    }),
  );

  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "export",
    "Guide for bulk-exporting Tally masters or vouchers to disk.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP bulk-export guide. " +
              "Two export tools are available: " +
              "`tally_export_masters` exports master data (ledgers, groups, stock items, cost centres) to the configured output directory. " +
              "`tally_export_vouchers` exports voucher transactions for a specified period (default: current Indian FY). " +
              "Both tools return the output file paths upon completion.",
          },
        },
      ],
    }),
  );

  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "audit",
    "Analytical guide for running audit-lite and interpreting the findings and books-score.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP audit-lite guide. " +
              "`tally_run_audit_lite` performs a set of analytical checks on the loaded company and returns a result object containing: " +
              "`result.findings` — an array of findings, each with a `code`, `severity`, and `suggestedFix` field; " +
              "`result.booksScore` — a composite score from 0 to 100 with component breakdown; " +
              "`workbookPath` — path to an Excel workbook for offline review. " +
              "Note: this tool provides analytical support only; it does not constitute a statutory audit opinion.",
          },
        },
      ],
    }),
  );

  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "dashboard",
    "Guide for generating one of the 3 available Excel dashboards.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP dashboard guide. " +
              "`tally_export_dashboard` accepts a `kind` parameter and generates a formatted Excel dashboard, returning the output file path. " +
              "Available dashboard kinds: `ManagementSnapshot` (overall financial summary), " +
              "`SalesTrend` (period-over-period sales analysis), " +
              "`ExceptionsOverview` (transactions flagged by audit-lite checks). " +
              "The user selects the desired kind before the tool is invoked.",
          },
        },
      ],
    }),
  );

  // Rewritten to descriptive prose to avoid Claude's prompt-injection
  // guardrail warning when users attach this prompt via "+ → Connectors".
  // (v1.0.2 #132, 2026-05-27.)
  server.prompt(
    "help",
    "Overview of TallyMCP capabilities and prerequisites.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "TallyMCP capabilities overview. " +
              "Prerequisites: TallyPrime must be running with at least one company loaded and XML integration enabled " +
              "(Tally Gateway Server set to Client/Server → Both, port 9000). " +
              "Available prompt workflows: config (first-time setup), read (fetch reports), export (bulk data export), " +
              "audit (books health check), dashboard (Excel dashboards). " +
              "Security note: TallyMCP operates in read-only mode — no data is written back to Tally.",
          },
        },
      ],
    }),
  );
}

function registerResources(server: McpServer, ctx: McpContext): void {
  server.resource("companies", "tally://companies", async () => {
    const companies = await listCompanies(ctx.tallyClient);
    return {
      contents: [
        {
          uri: "tally://companies",
          mimeType: "application/json",
          text: JSON.stringify(companies, null, 2),
        },
      ],
    };
  });

  server.resource("edition-notes", "tally://docs/edition-notes", async () => {
    const text = [
      "# TallyPrime edition notes",
      "",
      "What works at full speed depends on the Tally edition.",
      "",
      "## TallyPrime 4.x (Gold / single-user Prime)",
      "",
      "Everything in this MCP server works:",
      "- All 10 read reports including Trial Balance, P&L, Balance Sheet",
      "- Day Book and Sales Register (voucher-level)",
      "- `tally_get_ledger_closing_balance`, `tally_get_group_closing_balances`",
      "- `tally_run_audit_lite` (18 checks) and the 3 dashboards",
      "",
      "## TallyPrime Silver (and older editions)",
      "",
      "Fast (always works):",
      "- `tally_test_connection`, `tally_list_companies`, `tally_get_company_info`",
      "- `tally_read_report` for `ListOfCompanies`, `CompanyInfo`, `LedgerMasters`, `GroupMasters`, `VoucherTypes`",
      "- `tally_export_masters`",
      "",
      "Slow / may time out on large datasets (Silver evaluates `$ClosingBalance`",
      "before filters and lacks the balance cache 4.x has):",
      "- Day Book / Sales Register (voucher collection)",
      "- Trial Balance / P&L / Balance Sheet (legacy report form)",
      "- `tally_get_ledger_closing_balance`, `tally_get_group_closing_balances`",
      "- `tally_run_audit_lite`, dashboard exports",
      "",
      "For the 'sales figure' question on Silver against a large book, use the",
      "TallyPrime UI directly (Display → Account Books → Sales Register) or",
      "upgrade to TallyPrime 4.x where the same MCP tools work in seconds.",
    ].join("\n");
    return {
      contents: [
        { uri: "tally://docs/edition-notes", mimeType: "text/markdown", text },
      ],
    };
  });

  server.resource("connection-guide", "tally://docs/connection-guide", async () => {
    const guide = [
      "# Connecting TallyMCP to TallyPrime",
      "",
      "1. Open TallyPrime and load the company you want to read.",
      "2. F1 (Help) → Settings → Connectivity → Client/Server Configuration → set to **Both**, port **9000**.",
      "3. Ensure Windows Firewall allows inbound TCP 9000 on the *Private* profile.",
      "4. Verify with `tally_test_connection` — expect `{ ok: true }`.",
      "",
      "Common diagnostic codes:",
      "- `XML_INTERFACE_OFF` — Client/Server is not set to Both.",
      "- `NO_COMPANY_LOADED` — open a company in TallyPrime.",
      "- `CONNECTION_REFUSED` — Tally is not running, or the port is blocked.",
    ].join("\n");
    return {
      contents: [
        {
          uri: "tally://docs/connection-guide",
          mimeType: "text/markdown",
          text: guide,
        },
      ],
    };
  });

  // Dynamic resources for last-audit-result and per-company info are exposed
  // as URIs the client can read on demand.
  server.resource("audit-last", "tally://audit/last", async () => {
    const { readLastAuditResult } = await import("./audit.js");
    const text = await readLastAuditResult(ctx);
    return {
      contents: [
        {
          uri: "tally://audit/last",
          mimeType: "application/json",
          text,
        },
      ],
    };
  });
}
