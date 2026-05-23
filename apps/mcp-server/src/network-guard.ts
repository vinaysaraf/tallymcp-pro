/**
 * Network egress guard (constraint C-R3).
 *
 * The MCP server is a local-only process: every outbound HTTP request must
 * land on the configured TallyPrime host:port. `createNetworkGuard` returns a
 * cheap function-level guard used by code paths that take URLs from input.
 */

export class NetworkGuardError extends Error {
  constructor(
    public readonly attemptedUrl: string,
    public readonly allowed: { host: string; port: number },
  ) {
    super(
      `Network guard: egress blocked to ${attemptedUrl} (only the configured Tally host ${allowed.host}:${allowed.port} is permitted).`,
    );
    this.name = "NetworkGuardError";
  }
}

export interface NetworkGuard {
  readonly allowed: { host: string; port: number };
  isAllowed(url: string | URL): boolean;
  assertAllowed(url: string | URL): void;
}

export function createNetworkGuard(config: { host: string; port: number }): NetworkGuard {
  const allowed = { host: config.host, port: config.port };
  const defaultPortFor = (protocol: string): number => (protocol === "http:" ? 80 : 443);

  const isAllowed = (url: string | URL): boolean => {
    let parsed: URL;
    try {
      parsed = url instanceof URL ? url : new URL(url);
    } catch {
      return false;
    }
    const port = parsed.port ? Number(parsed.port) : defaultPortFor(parsed.protocol);
    return parsed.hostname === allowed.host && port === allowed.port;
  };

  return {
    allowed,
    isAllowed,
    assertAllowed(url) {
      if (!isAllowed(url)) {
        throw new NetworkGuardError(
          url instanceof URL ? url.toString() : url,
          allowed,
        );
      }
    },
  };
}
