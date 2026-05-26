import { describe, it, expect, vi } from "vitest";
import { probeTallyOnce, createTallyPoller } from "../../src/main/tally-poller.js";

describe("probeTallyOnce", () => {
  it("returns reachable:true + companyName when XML returns OM JAI JAGDISH", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        '<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="OM JAI JAGDISH" /></COLLECTION></DATA></BODY></ENVELOPE>',
        { status: 200 },
      ),
    );
    const result = await probeTallyOnce({ url: "http://127.0.0.1:9000", fetcher });
    expect(result.reachable).toBe(true);
    expect(result.companyName).toBe("OM JAI JAGDISH");
  });

  it("returns reachable:false when fetch throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await probeTallyOnce({ url: "http://127.0.0.1:9000", fetcher });
    expect(result.reachable).toBe(false);
    expect(result.companyName).toBeUndefined();
  });

  it("returns reachable:true but no companyName when response has none", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<RESPONSE><LINEERROR>No company loaded</LINEERROR></RESPONSE>", { status: 200 }),
    );
    const result = await probeTallyOnce({ url: "http://127.0.0.1:9000", fetcher });
    expect(result.reachable).toBe(true);
    expect(result.companyName).toBeUndefined();
  });
});

describe("createTallyPoller", () => {
  it("invokes the emitter at the configured interval", async () => {
    vi.useFakeTimers();
    const emitter = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response("<ENVELOPE/>", { status: 200 }));

    const poller = createTallyPoller({
      url: "http://127.0.0.1:9000",
      intervalMs: 100,
      fetcher,
      onStatus: emitter,
    });
    poller.start();

    // Immediate first probe
    await vi.advanceTimersByTimeAsync(0);
    expect(emitter).toHaveBeenCalledTimes(1);

    // After 100 ms — second probe
    await vi.advanceTimersByTimeAsync(100);
    expect(emitter).toHaveBeenCalledTimes(2);

    poller.stop();
    vi.useRealTimers();
  });
});
