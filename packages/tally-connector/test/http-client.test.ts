import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TallyHttpError, TallyRequestTimeoutError } from "../src/errors.js";
import { TallyHttpClient } from "../src/http-client.js";

function createBlackHoleServer(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((_req, _res) => {
      // Accept the connection but never write a response.
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

function createFastResponseServer(body: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../samples");

describe("TallyHttpClient", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  function client(overrides?: Partial<ConstructorParameters<typeof TallyHttpClient>[0]>) {
    return new TallyHttpClient({
      host: "127.0.0.1",
      port: 9000,
      dispatcher: agent,
      serialize: false,
      ...overrides,
    });
  }

  it("returns response body on HTTP 200 (default UTF-16 LE wire)", async () => {
    const fixture = readFileSync(join(samplesDir, "list-companies.response.xml"), "utf8");
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(200, Buffer.from(fixture, "utf16le"));

    const text = await client().post("<ENVELOPE/>");
    expect(text).toContain("<COMPANY");
  });

  it("throws TallyHttpError on non-200 status", async () => {
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(500, "Internal error");

    await expect(client().post("<ENVELOPE/>")).rejects.toMatchObject({
      name: "TallyHttpError",
      message: "Tally returned HTTP 500",
      meta: { statusCode: 500, host: "127.0.0.1", port: 9000 },
    });
  });

  it("serializes parallel posts when serialize is true", async () => {
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;

    const pool = agent.get("http://127.0.0.1:9000");
    pool
      .intercept({ path: "/", method: "POST" })
      .reply(200, () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        return new Promise<Buffer>((resolve) => {
          setTimeout(() => {
            order.push(active);
            active -= 1;
            resolve(Buffer.from("ok", "utf16le"));
          }, 30);
        });
      })
      .times(2);

    const serialized = new TallyHttpClient({
      host: "127.0.0.1",
      port: 9000,
      dispatcher: agent,
      serialize: true,
    });

    await Promise.all([serialized.post("a"), serialized.post("b")]);
    expect(maxActive).toBe(1);
    expect(order.length).toBe(2);
  });

  describe("charset handling", () => {
    it("posts UTF-16 LE by default and decodes the response as UTF-16 LE", async () => {
      const body = "<ENVELOPE><BODY><X>ok</X></BODY></ENVELOPE>";
      agent
        .get("http://127.0.0.1:9000")
        .intercept({ path: "/", method: "POST" })
        .reply(200, Buffer.from(body, "utf16le"));

      const text = await client().post("<ENVELOPE/>");
      expect(text).toContain("<X>ok</X>");
    });

    it("posts UTF-8 and decodes UTF-8 when charset='utf-8' is passed per call", async () => {
      const body = "<ENVELOPE><BODY><X>ok</X></BODY></ENVELOPE>";
      agent
        .get("http://127.0.0.1:9000")
        .intercept({ path: "/", method: "POST" })
        .reply(200, body);

      const text = await client().post("<ENVELOPE/>", { charset: "utf-8" });
      expect(text).toContain("<X>ok</X>");
    });

    it("honors a constructor-level default charset", async () => {
      agent
        .get("http://127.0.0.1:9000")
        .intercept({ path: "/", method: "POST" })
        .reply(200, "<X>ok</X>");

      const c = client({ charset: "utf-8" });
      const text = await c.post("<ENVELOPE/>");
      expect(text).toContain("<X>ok</X>");
    });
  });
});

describe("TallyHttpError", () => {
  it("exposes meta for CA-facing diagnostics", () => {
    const err = new TallyHttpError("Tally returned HTTP 403", {
      statusCode: 403,
      host: "127.0.0.1",
      port: 9000,
    });
    expect(err.name).toBe("TallyHttpError");
    expect(err.meta.statusCode).toBe(403);
  });
});

describe("TallyRequestTimeoutError", () => {
  it("has the correct name and message", () => {
    const err = new TallyRequestTimeoutError("http://127.0.0.1:9000/", 150, 100);
    expect(err.name).toBe("TallyRequestTimeoutError");
    expect(err.message).toContain("http://127.0.0.1:9000/");
    expect(err.message).toContain("150ms");
    expect(err.message).toContain("100ms");
  });
});

describe("TallyHttpClient timeout behaviour", () => {
  it("throws TallyRequestTimeoutError when the server doesn't respond within timeoutMs", async () => {
    const server = await createBlackHoleServer();
    const c = new TallyHttpClient({ host: "127.0.0.1", port: server.port, timeoutMs: 100, serialize: false });
    try {
      await expect(c.post("<ENVELOPE/>")).rejects.toBeInstanceOf(TallyRequestTimeoutError);
    } finally {
      server.close();
    }
  });

  it("per-call timeoutMs overrides the instance default", async () => {
    const server = await createBlackHoleServer();
    try {
      const c = new TallyHttpClient({ host: "127.0.0.1", port: server.port, timeoutMs: 10_000, serialize: false });
      const start = Date.now();
      await expect(c.post("<ENVELOPE/>", { timeoutMs: 100 })).rejects.toBeInstanceOf(
        TallyRequestTimeoutError,
      );
      expect(Date.now() - start).toBeLessThan(5_000);
    } finally {
      server.close();
    }
  });

  it("does NOT timeout on a fast response (sanity)", async () => {
    const responseBody = "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
    const server = await createFastResponseServer(responseBody);
    try {
      const c = new TallyHttpClient({ host: "127.0.0.1", port: server.port, timeoutMs: 5_000, charset: "utf-8", serialize: false });
      const result = await c.post("<ENVELOPE/>");
      expect(result).toContain("<STATUS>1</STATUS>");
    } finally {
      server.close();
    }
  });
});
