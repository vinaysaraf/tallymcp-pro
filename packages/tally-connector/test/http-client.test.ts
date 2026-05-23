import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TallyHttpError } from "../src/errors.js";
import { TallyHttpClient } from "../src/http-client.js";

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

  it("returns response body on HTTP 200", async () => {
    const fixture = readFileSync(join(samplesDir, "list-companies.response.xml"), "utf8");
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(200, fixture);

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
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            order.push(active);
            active -= 1;
            resolve("ok");
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
