import { describe, it, expect, vi } from "vitest";
import { probeTallyOnce, createTallyPoller } from "../../src/main/tally-poller.js";

describe("probeTallyOnce", () => {
  it("returns reachable:true + companyName when XML returns Acme Industries Pvt Ltd", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        '<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="Acme Industries Pvt Ltd" /></COLLECTION></DATA></BODY></ENVELOPE>',
        { status: 200 },
      ),
    );
    const result = await probeTallyOnce({ url: "http://127.0.0.1:9000", fetcher });
    expect(result.reachable).toBe(true);
    expect(result.companyName).toBe("Acme Industries Pvt Ltd");
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

  it("resolves a function URL provider fresh on every tick (follows a connection change)", async () => {
    vi.useFakeTimers();
    const emitter = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response("<ENVELOPE/>", { status: 200 }));
    // Provider returns a different URL on each call — simulates the user
    // switching This-PC → Server between ticks.
    const urls = ["http://127.0.0.1:9000", "http://192.168.1.50:9000"];
    let i = 0;
    const urlProvider = vi.fn(() => urls[Math.min(i++, urls.length - 1)]!);

    const poller = createTallyPoller({
      url: urlProvider,
      intervalMs: 100,
      fetcher,
      onStatus: emitter,
    });
    poller.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9000");

    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher.mock.calls[1]?.[0]).toBe("http://192.168.1.50:9000");
    expect(urlProvider).toHaveBeenCalledTimes(2);

    poller.stop();
    vi.useRealTimers();
  });
});
