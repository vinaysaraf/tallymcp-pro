import { request, type Dispatcher } from "undici";
import { TallyHttpError } from "./errors.js";
import { RequestSerializer } from "./serializer.js";

export interface TallyHttpClientOptions {
  host: string;
  port: number;
  timeoutMs?: number;
  /** Serialize requests so Tally never sees parallel POSTs. Default true. */
  serialize?: boolean;
  dispatcher?: Dispatcher;
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

  async post(xmlBody: string): Promise<string> {
    const run = () => this.postInternal(xmlBody);
    if (this.opts.serialize !== false) {
      return this.serializer.enqueue(run);
    }
    return run();
  }

  private async postInternal(xmlBody: string): Promise<string> {
    const { host, port, timeoutMs = 60_000, dispatcher } = this.opts;
    const url = `http://${host}:${port}/`;

    const { statusCode, body } = await request(url, {
      method: "POST",
      body: xmlBody,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      bodyTimeout: timeoutMs,
      headersTimeout: 10_000,
      dispatcher,
    });

    if (statusCode !== 200) {
      throw new TallyHttpError(`Tally returned HTTP ${statusCode}`, {
        statusCode,
        host,
        port,
      });
    }

    return body.text();
  }
}
