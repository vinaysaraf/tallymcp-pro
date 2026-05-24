import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockAgent, errors } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TallyHttpError } from "../src/errors.js";
import { TallyHttpClient } from "../src/http-client.js";
import {
  analyzeDiagnoseResponse,
  diagnoseTally,
  mapDiagnoseError,
} from "../src/diagnose.js";
import { DiagnosticResultSchema } from "../src/diagnostic.js";

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../samples");

describe("analyzeDiagnoseResponse", () => {
  it("returns ok with company count from fixture", () => {
    const fixture = readFileSync(join(samplesDir, "list-companies.response.xml"), "utf8");
    const result = analyzeDiagnoseResponse(fixture);
    expect(result).toEqual({
      ok: true,
      companiesLoaded: 1,
      tallyVersion: undefined,
    });
    expect(DiagnosticResultSchema.parse(result).ok).toBe(true);
  });

  it("maps empty body to XML_INTERFACE_OFF", () => {
    const result = analyzeDiagnoseResponse("   \n  ");
    expect(result).toMatchObject({
      ok: false,
      code: "XML_INTERFACE_OFF",
    });
  });

  it("maps LINEERROR to UNEXPECTED_RESPONSE", () => {
    const result = analyzeDiagnoseResponse(
      "<ENVELOPE><LINEERROR>Closed period</LINEERROR></ENVELOPE>",
    );
    expect(result).toMatchObject({
      ok: false,
      code: "UNEXPECTED_RESPONSE",
      message: "Closed period",
    });
  });

  it("maps empty DATA to NO_COMPANY_LOADED", () => {
    const result = analyzeDiagnoseResponse(
      `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA></DATA></BODY></ENVELOPE>`,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "NO_COMPANY_LOADED",
    });
  });
});

describe("mapDiagnoseError", () => {
  const client = new TallyHttpClient({ host: "127.0.0.1", port: 9000, serialize: false });

  it("maps ECONNREFUSED to PORT_REFUSED", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const result = mapDiagnoseError(err, client);
    expect(result).toMatchObject({ ok: false, code: "PORT_REFUSED" });
    if (!result.ok) expect(result.hint).toContain("9000");
  });

  it("maps timeout errors to TALLY_NOT_REACHABLE", () => {
    const result = mapDiagnoseError(new errors.HeadersTimeoutError(), client);
    expect(result).toMatchObject({ ok: false, code: "TALLY_NOT_REACHABLE" });
  });

  it("maps TallyHttpError to UNEXPECTED_RESPONSE", () => {
    const result = mapDiagnoseError(
      new TallyHttpError("Tally returned HTTP 500", { statusCode: 500 }),
      client,
    );
    expect(result).toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });
});

describe("diagnoseTally", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  function mockClient(timeoutMs?: number) {
    return new TallyHttpClient({
      host: "127.0.0.1",
      port: 9000,
      dispatcher: agent,
      serialize: false,
      timeoutMs,
    });
  }

  it("returns ok against list-companies response fixture", async () => {
    const fixture = readFileSync(join(samplesDir, "list-companies.response.xml"), "utf8");
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(200, Buffer.from(fixture, "utf16le"));

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.companiesLoaded).toBeGreaterThanOrEqual(1);
  });

  it("returns PORT_REFUSED when connection is refused", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .replyWithError(err);

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result).toMatchObject({ ok: false, code: "PORT_REFUSED" });
  });

  it("returns TALLY_NOT_REACHABLE on body timeout", async () => {
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .replyWithError(new errors.BodyTimeoutError());

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result).toMatchObject({ ok: false, code: "TALLY_NOT_REACHABLE" });
  });

  it("returns XML_INTERFACE_OFF for empty HTTP 200 body", async () => {
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(200, Buffer.from("  ", "utf16le"));

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result).toMatchObject({ ok: false, code: "XML_INTERFACE_OFF" });
  });

  it("returns UNEXPECTED_RESPONSE when LINEERROR is present", async () => {
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(
        200,
        Buffer.from("<ENVELOPE><LINEERROR>Invalid company</LINEERROR></ENVELOPE>", "utf16le"),
      );

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result).toMatchObject({
      ok: false,
      code: "UNEXPECTED_RESPONSE",
      message: "Invalid company",
    });
  });

  it("returns NO_COMPANY_LOADED when DATA has no companies", async () => {
    agent
      .get("http://127.0.0.1:9000")
      .intercept({ path: "/", method: "POST" })
      .reply(
        200,
        Buffer.from(
          `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA></DATA></BODY></ENVELOPE>`,
          "utf16le",
        ),
      );

    const result = await diagnoseTally(mockClient(), { envelope: "<ENVELOPE/>" });
    expect(result).toMatchObject({ ok: false, code: "NO_COMPANY_LOADED" });
  });
});
