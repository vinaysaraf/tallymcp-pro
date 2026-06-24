import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import type { TallyCapabilities } from "../src/capability.js";
import { registerTallyMcp } from "../src/server.js";

let scratchDir: string;
let configPath: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "tallymcp-srv-"));
  configPath = join(scratchDir, "config.json");
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function bootServerPair(capabilitiesOverride?: TallyCapabilities) {
  const ctx = await createContext({
    configPath,
    outputDir: join(scratchDir, "out"),
    skipCapabilityProbe: true,
    capabilitiesOverride,
  });
  const server = new McpServer(
    { name: "tallymcp-pro", version: "0.0.1" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );
  registerTallyMcp(server, ctx);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "test-client", version: "0.0.1" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

/** Silver-class: report-form works, but $ClosingBalance is too slow. */
const SILVER_CAPS: TallyCapabilities = {
  reachable: true,
  edition: "silver",
  reportFormViable: true,
  computedBalancesViable: false,
  detectedAt: "2026-06-24T00:00:00.000Z",
  message: "Silver test caps.",
};

/** Unreachable / no company: nothing is viable. */
const UNREACHABLE_CAPS: TallyCapabilities = {
  reachable: false,
  edition: "unknown",
  reportFormViable: false,
  computedBalancesViable: false,
  detectedAt: "2026-06-24T00:00:00.000Z",
  message: "Unreachable test caps.",
};

const textOf = (result: { content?: Array<{ type: string; text?: string }> }): string =>
  result.content?.[0]?.type === "text" ? String(result.content[0]?.text ?? "") : "";

describe("MCP server integration (in-process)", () => {
  it("exposes 19 tools — and zero post/write/alter names (C-R1, C-R2)", async () => {
    const { client } = await bootServerPair();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toHaveLength(19);
    for (const banned of ["post", "write", "alter"]) {
      const offenders = names.filter((n) => n.toLowerCase().includes(banned));
      expect(offenders, `Names containing "${banned}": ${offenders.join(", ")}`).toEqual([]);
    }
    // 'import' / 'create' permitted only in the explicit file-import + mcp-config tools.
  });

  it("includes the expected tool surface", async () => {
    const { client } = await bootServerPair();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "tally_config_get",
        "tally_config_update",
        "tally_export_dashboard",
        "tally_export_masters",
        "tally_export_mcp_config",
        "tally_export_report_excel",
        "tally_export_report_json",
        "tally_export_vouchers",
        "tally_get_capabilities",
        "tally_get_company_info",
        "tally_get_group_closing_balances",
        "tally_get_ledger_closing_balance",
        "tally_import_vouchers_from_file",
        "tally_list_companies",
        "tally_list_reports",
        "tally_read_report",
        "tally_run_audit_lite",
        "tally_set_default_company",
        "tally_test_connection",
      ].sort(),
    );
  });

  it("exposes 6 prompts: config, read, export, audit, dashboard, help", async () => {
    const { client } = await bootServerPair();
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name).sort()).toEqual(
      ["audit", "config", "dashboard", "export", "help", "read"],
    );
  });

  it("exposes the documented static resources", async () => {
    const { client } = await bootServerPair();
    const resources = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(resources).toContain("tally://docs/connection-guide");
    expect(resources).toContain("tally://docs/edition-notes");
    expect(resources).toContain("tally://audit/last");
  });

  it("tally_list_reports returns the 10 in-scope report descriptors", async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({ name: "tally_list_reports", arguments: {} });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const list = JSON.parse(String(text));
    expect(list).toHaveLength(10);
    expect(list[0].reportId).toBe("ListOfCompanies");
  });

  // 60 s — diagnose hits a real local Tally if present, which can be slow when
  // the instance is mid-computation on another request. The assertion only
  // requires a structured shape.
  it("tally_test_connection returns a structured diagnostic", { timeout: 60_000 }, async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({
      name: "tally_test_connection",
      arguments: {},
    });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const diag = JSON.parse(String(text));
    expect(diag).toHaveProperty("ok");
    expect(typeof diag.ok).toBe("boolean");
    // Either ok with a company count, or fail with a diagnostic code — both shapes are valid.
    if (diag.ok === false) expect(diag.code).toBeTruthy();
    else expect(typeof diag.companiesLoaded).toBe("number");
  });

  it("tally_export_mcp_config emits a cursor JSON snippet", async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({
      name: "tally_export_mcp_config",
      arguments: { client: "cursor", serverEntry: "/path/to/main.js" },
    });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const payload = JSON.parse(String(text));
    expect(payload.client).toBe("cursor");
    expect(payload.format).toBe("json");
    const snippet = JSON.parse(payload.content);
    expect(snippet.mcpServers["tallymcp-pro"].args).toEqual(["/path/to/main.js"]);
  });

  it("tally_export_mcp_config default entry is the running server path, not the old dist/main.js literal (#152 PR review)", async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({
      name: "tally_export_mcp_config",
      arguments: { client: "cursor" }, // no serverEntry → must derive from runtime
    });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const payload = JSON.parse(String(text));
    const snippet = JSON.parse(payload.content);
    const entry = snippet.mcpServers["tallymcp-pro"].args[0];
    // The old hardcoded default "dist/main.js" generated a broken path for
    // installed v1.0.5 users. The default now derives from process.argv[1].
    expect(entry).not.toBe("dist/main.js");
    expect(typeof entry).toBe("string");
    expect(entry.length).toBeGreaterThan(0);
  });

  it("tally_config_get returns the cached config (security.readOnly defaults true)", async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({ name: "tally_config_get", arguments: {} });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const config = JSON.parse(String(text));
    expect(config.security.readOnly).toBe(true);
  });
});

// Edition gating (#OMAI Codex iter-1): the report-form voucher/audit/dashboard tools
// must NOT be blocked on Silver-class editions — only the computed-balance tools are.
// We assert this at the MCP-tool boundary: with Silver caps and NO company supplied,
// the report-form tools fall through the gate to the "No company supplied" path
// (proving the gate passed), while the computed-balance tools return the gate error.
describe("edition gating (report-form vs computed-balance)", () => {
  const GATE_REPORT_FORM = /needs TallyPrime reachable with a company loaded/i;
  const GATE_COMPUTED = /closing-balance tools are disabled/i;
  const NO_COMPANY = /No company supplied/i;

  it("Silver: tally_export_vouchers reaches the service path (not the edition gate)", async () => {
    const { client } = await bootServerPair(SILVER_CAPS);
    const out = await client.callTool({
      name: "tally_export_vouchers",
      arguments: { fromDate: "20250401", toDate: "20260331" },
    });
    const text = textOf(out);
    expect(text).toMatch(NO_COMPANY); // passed the gate → hit company resolution
    expect(text).not.toMatch(GATE_REPORT_FORM);
    expect(text).not.toMatch(GATE_COMPUTED);
  });

  it("Silver: tally_run_audit_lite reaches the service path (not the edition gate)", async () => {
    const { client } = await bootServerPair(SILVER_CAPS);
    const out = await client.callTool({ name: "tally_run_audit_lite", arguments: {} });
    expect(textOf(out)).toMatch(NO_COMPANY);
  });

  it("Silver: tally_export_dashboard reaches the service path (not the edition gate)", async () => {
    const { client } = await bootServerPair(SILVER_CAPS);
    const out = await client.callTool({
      name: "tally_export_dashboard",
      arguments: { kind: "ManagementSnapshot" },
    });
    expect(textOf(out)).toMatch(NO_COMPANY);
  });

  it("Silver: tally_get_ledger_closing_balance STAYS gated (slow $ClosingBalance)", async () => {
    const { client } = await bootServerPair(SILVER_CAPS);
    const out = await client.callTool({
      name: "tally_get_ledger_closing_balance",
      arguments: { ledger: "Cash" },
    });
    expect(textOf(out)).toMatch(GATE_COMPUTED);
  });

  it("Unreachable: tally_export_vouchers is gated (needs a reachable company)", async () => {
    const { client } = await bootServerPair(UNREACHABLE_CAPS);
    const out = await client.callTool({
      name: "tally_export_vouchers",
      arguments: { fromDate: "20250401", toDate: "20260331" },
    });
    expect(textOf(out)).toMatch(GATE_REPORT_FORM);
  });
});
