import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diagnoseTally } from "@tallymcp/tally-connector";
import {
  getCompanyInfo,
  listCompanies,
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

  // 10. tally_export_vouchers
  server.tool(
    "tally_export_vouchers",
    "Stream the Day Book for a period to a single CSV (memory-safe).",
    {
      company: z.string().optional(),
      fromDate: TallyDateSchema,
      toDate: TallyDateSchema,
    },
    async ({ company, fromDate, toDate }) => {
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

  // 11. tally_run_audit_lite — wired in S4.3
  server.tool(
    "tally_run_audit_lite",
    "Run the 18 rule-based audit-lite checks against the company books and return findings + books score.",
    {
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ company, fromDate, toDate }) => {
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

  // 12. tally_export_dashboard — wired in S4.3
  server.tool(
    "tally_export_dashboard",
    "Render one of the 3 Excel dashboards (ManagementSnapshot, SalesTrend, ExceptionsOverview).",
    {
      kind: z.enum(["ManagementSnapshot", "SalesTrend", "ExceptionsOverview"]),
      company: z.string().optional(),
      ...PERIOD_OPTIONAL,
    },
    async ({ kind, company, fromDate, toDate }) => {
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

  // 15. tally_export_mcp_config
  server.tool(
    "tally_export_mcp_config",
    "Emit a copy-pasteable MCP client config snippet for Claude Desktop, Cursor, LM Studio, or Ollama.",
    {
      client: z.enum(["cursor", "claude-desktop", "lm-studio", "ollama"]),
      serverEntry: z.string().optional().describe("Override the path to dist/main.js."),
    },
    async ({ client, serverEntry }) => {
      try {
        const entry = serverEntry ?? process.env.TALLYMCP_SERVER_ENTRY ?? "dist/main.js";
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

function registerPrompts(server: McpServer, _ctx: McpContext): void {
  server.prompt(
    "config",
    "Guide the user through testing the Tally connection and selecting a default company.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Help me configure TallyMCP. " +
              "Run `tally_test_connection` first. If it fails, use the diagnostic hint to explain the fix in plain English. " +
              "If it succeeds, run `tally_list_companies` and ask me which company to set as default; then call `tally_set_default_company`.",
          },
        },
      ],
    }),
  );

  server.prompt(
    "read",
    "Pick one of the 10 read reports and produce JSON + Excel.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Show me the 10 read reports via `tally_list_reports`. " +
              "Ask me which report, company, and period (defaults: current Indian FY). " +
              "Call `tally_read_report` and summarize the rows in plain English. " +
              "Offer `tally_export_report_excel` if I want a workbook.",
          },
        },
      ],
    }),
  );

  server.prompt(
    "export",
    "Run a bulk export of masters or vouchers.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Help me bulk-export Tally data. Ask whether I want masters or vouchers. " +
              "For masters use `tally_export_masters`. For vouchers use `tally_export_vouchers` " +
              "with a period (default: current Indian FY). Report back the file paths.",
          },
        },
      ],
    }),
  );

  server.prompt(
    "audit",
    "Run audit-lite, explain findings from tool JSON, and report the books-score.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Run `tally_run_audit_lite` for the loaded company. " +
              "Open the `result.findings` JSON inline and explain each finding in plain English — " +
              "code, severity, and the suggested fix. " +
              "Quote the `result.booksScore` (0–100) with its component breakdown. " +
              "Remind me this is analytical support only, not a statutory audit opinion. " +
              "Hand me the `workbookPath` for offline review.",
          },
        },
      ],
    }),
  );

  server.prompt(
    "dashboard",
    "Render one of the 3 Excel dashboards.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ask me which dashboard: ManagementSnapshot, SalesTrend, or ExceptionsOverview. " +
              "Call `tally_export_dashboard` with that kind and tell me the file path.",
          },
        },
      ],
    }),
  );

  server.prompt(
    "help",
    "Show available commands and prerequisites.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Tell me what TallyMCP can do. Mention: " +
              "TallyPrime must be running with a company loaded and XML enabled (Client/Server → Both, port 9000). " +
              "Commands: /config /read /export /audit /dashboard. " +
              "Read-only: no data will ever be written back to Tally.",
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
