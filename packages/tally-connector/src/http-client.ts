import { request, type Dispatcher } from "undici";
import { TallyHttpError, TallyRequestTimeoutError } from "./errors.js";
import { RequestSerializer } from "./serializer.js";

export type TallyCharset = "utf-16" | "utf-8";

export interface TallyHttpClientOptions {
  host: string;
  port: number;
  /**
   * Total per-request timeout (ms). When exceeded the connector throws
   * TallyRequestTimeoutError instead of hanging. Default 30 s.
   * Replaces the old split bodyTimeout/headersTimeout approach.
   */
  timeoutMs?: number;
  /** Serialize requests so Tally never sees parallel POSTs. Default true. */
  serialize?: boolean;
  /**
   * Default wire encoding. v0.7 ships **UTF-16 LE** because Tally's XML
   * engine is empirically more performant and stable on busy Silver books
   * with UTF-16. Per-call override available via `post(xml, { charset })`.
   */
  charset?: TallyCharset;
  dispatcher?: Dispatcher;
}

export interface TallyPostOptions {
  /** Overrides the constructor-level `charset` for a single request. */
  charset?: TallyCharset;
  /** Per-call timeout override (ms). Takes priority over instance default. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class TallyHttpClient {
  private readonly serializer = new RequestSerializer();

  constructor(private readonly opts: TallyHttpClientOptions) {}

  get host(): string {
    return this.opts.host;
  }

  get port(): number {
    return this.opts.port;
  }

  async post(xmlBody: string, options?: TallyPostOptions): Promise<string> {
    const charset = options?.charset ?? this.opts.charset ?? "utf-16";
    const timeoutMs =
      options?.timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const run = () => this.postInternal(xmlBody, charset, timeoutMs);
    if (this.opts.serialize !== false) {
      return this.serializer.enqueue(run);
    }
    return run();
  }

  private async postInternal(
    xmlBody: string,
    charset: TallyCharset,
    timeoutMs: number,
  ): Promise<string> {
    const { host, port, dispatcher } = this.opts;
    const url = `http://${host}:${port}/`;

    const encoded =
      charset === "utf-16" ? Buffer.from(xmlBody, "utf16le") : Buffer.from(xmlBody, "utf8");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const { statusCode, body } = await request(url, {
        method: "POST",
        body: encoded,
        headers: {
          "Content-Type": `text/xml; charset=${charset}`,
          "Content-Length": String(encoded.byteLength),
        },
        signal: controller.signal,
        dispatcher,
      });

      if (statusCode !== 200) {
        throw new TallyHttpError(`Tally returned HTTP ${statusCode}`, {
          statusCode,
          host,
          port,
        });
      }

      const responseBuffer = Buffer.from(await body.arrayBuffer());
      return charset === "utf-16"
        ? responseBuffer.toString("utf16le")
        : responseBuffer.toString("utf8");
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          ("code" in err && (err as NodeJS.ErrnoException).code === "UND_ERR_ABORTED"))
      ) {
        const elapsedMs = Date.now() - startMs;
        throw new TallyRequestTimeoutError(url, elapsedMs, timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
