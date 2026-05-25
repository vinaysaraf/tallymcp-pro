import { request, type Dispatcher } from "undici";
import { TallyHttpError } from "./errors.js";
import { RequestSerializer } from "./serializer.js";

export type TallyCharset = "utf-16" | "utf-8";

export interface TallyHttpClientOptions {
  host: string;
  port: number;
  /** Max time (ms) to wait for the response body to finish. Default 60 s. */
  timeoutMs?: number;
  /** Max time (ms) to wait for Tally to begin sending headers. Default 30 s. */
  headersTimeoutMs?: number;
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
}

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
    const run = () => this.postInternal(xmlBody, charset);
    if (this.opts.serialize !== false) {
      return this.serializer.enqueue(run);
    }
    return run();
  }

  private async postInternal(xmlBody: string, charset: TallyCharset): Promise<string> {
    const {
      host,
      port,
      timeoutMs = 60_000,
      headersTimeoutMs = 30_000,
      dispatcher,
    } = this.opts;
    const url = `http://${host}:${port}/`;

    const encoded =
      charset === "utf-16" ? Buffer.from(xmlBody, "utf16le") : Buffer.from(xmlBody, "utf8");

    const { statusCode, body } = await request(url, {
      method: "POST",
      body: encoded,
      headers: {
        "Content-Type": `text/xml; charset=${charset}`,
        "Content-Length": String(encoded.byteLength),
      },
      bodyTimeout: timeoutMs,
      headersTimeout: headersTimeoutMs,
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
  }
}
