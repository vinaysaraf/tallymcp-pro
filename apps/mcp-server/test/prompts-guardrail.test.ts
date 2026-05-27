import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../src/server.js";

// These patterns trigger Claude's prompt-injection guardrail when found
// in a prompt's content (Claude reads them as commands the file is trying
// to inject). Detecting them in tests guards against future prompt authors
// regressing to imperative phrasing.
const IMPERATIVE_PATTERNS = [
  /^Run\s+\w+/im,
  /^Call\s+\w+/im,
  /^Execute\s+\w+/im,
  /^First,\s/im,
  /^Help me\b/im,
  /\bThen call\s+\w+/im,
  /\bIf it succeeds,\s/im,
];

describe("MCP prompts — guardrail-friendly phrasing", () => {
  it("registerPrompts is exported", () => {
    expect(typeof registerPrompts).toBe("function");
  });

  it("every prompt's messages text is free of imperative patterns", async () => {
    // Boot a real McpServer + Client pair over in-memory transport so we can
    // list prompts and retrieve each one's template content exactly as a
    // real MCP client (Claude Desktop) would see it.
    const server = new McpServer(
      { name: "tallymcp-pro-test", version: "0.0.0" },
      { capabilities: { prompts: {} } },
    );

    // registerPrompts only needs the server argument for the prompts path;
    // the _ctx argument is unused in prompts, so we pass a minimal stub.
    registerPrompts(server, null as never);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "test-client", version: "0.0.0" },
      { capabilities: {} },
    );
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    // Discover all registered prompt names.
    const listResult = await client.listPrompts();
    expect(listResult.prompts.length).toBeGreaterThan(0);

    // Retrieve each prompt's messages and check for imperative patterns.
    const violations: string[] = [];
    for (const promptMeta of listResult.prompts) {
      const result = await client.getPrompt({ name: promptMeta.name, arguments: {} });
      for (const msg of result.messages) {
        if (msg.content.type === "text") {
          for (const pattern of IMPERATIVE_PATTERNS) {
            if (pattern.test(msg.content.text)) {
              violations.push(
                `Prompt "${promptMeta.name}" matches ${pattern}: "${msg.content.text.slice(0, 120)}..."`,
              );
            }
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
