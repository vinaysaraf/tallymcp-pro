export class TallyHttpError extends Error {
  constructor(
    message: string,
    public readonly meta: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TallyHttpError";
  }
}

export class TallyRequestTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly elapsedMs: number,
    public readonly timeoutMs: number,
  ) {
    super(
      `Tally request to ${url} timed out after ${elapsedMs}ms (limit ${timeoutMs}ms). ` +
        `Check Tally HTTP server status; if networked (Tally Gateway Server in tally.ini), ` +
        `verify the gateway host is reachable. Override via TALLYMCP_TIMEOUT env var or ` +
        `config.tally.requestTimeoutMs.`,
    );
    this.name = "TallyRequestTimeoutError";
  }
}
