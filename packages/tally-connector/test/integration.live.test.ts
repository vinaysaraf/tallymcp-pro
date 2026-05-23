import { describe, expect, it } from "vitest";
import { diagnoseTally, TallyHttpClient } from "../src/index.js";

const host = process.env.TALLY_HOST ?? "127.0.0.1";
const port = Number(process.env.TALLY_PORT ?? "9000");

describe("diagnoseTally live integration", () => {
  it.skipIf(process.env.TALLY_LIVE !== "1")(
    "connects to a running TallyPrime instance",
    async () => {
      const client = new TallyHttpClient({ host, port, serialize: true });
      const result = await diagnoseTally(client);
      expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
      if (result.ok) {
        expect(result.companiesLoaded).toBeGreaterThanOrEqual(1);
      }
    },
    90_000,
  );
});
