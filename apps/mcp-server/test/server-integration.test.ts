import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { registerTallyMcp } from "../src/server.js";

let scratchDir: string;
let configPath: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "tallymcp-srv-"));
  configPath = join(scratchDir, "config.json");
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

async function bootServerPair() {
  const ctx = await createContext({ configPath, outputDir: join(scratchDir, "out") });
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

describe("MCP server integration (in-process)", () => {
  it("exposes 17 tools — and zero post/write/alter names (C-R1, C-R2)", async () => {
    const { client } = await bootServerPair();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toHaveLength(17);
    for (const banned of ["post", "write", "alter", "import", "create"]) {
      const offenders = names.filter((n) => n.toLowerCase().includes(banned));
      expect(offenders, `Names containing "${banned}": ${offenders.join(", ")}`).toEqual([]);
    }
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
        "tally_get_company_info",
        "tally_get_group_closing_balances",
        "tally_get_ledger_closing_balance",
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

  it("tally_config_get returns the cached config (security.readOnly defaults true)", async () => {
    const { client } = await bootServerPair();
    const result = await client.callTool({ name: "tally_config_get", arguments: {} });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const config = JSON.parse(String(text));
    expect(config.security.readOnly).toBe(true);
  });
});
