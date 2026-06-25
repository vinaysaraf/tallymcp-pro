/**
 * Bare-hostname / IPv4 validation for the Tally connection, shared by the main
 * process (authoritative, in `writeTallyConnection`) and the renderer (`Settings`,
 * for instant UX). Lives in `shared/` with ZERO node/electron/cross-package
 * imports (only the global `URL` + a regex), so both bundle contexts use ONE
 * definition — no drift (Cursor + Codex review recommendation).
 */

// Character allow-list: letters, digits, dot, hyphen, underscore. Rejects every
// character that would change the endpoint when built into `http://${host}:${port}`
// — schemes (`://`), credentials (`@`), paths (`/`), query (`?`), fragment (`#`),
// an embedded port or IPv6 (`:`), and whitespace.
const TALLY_HOST_RE = /^[A-Za-z0-9._-]+$/;

/**
 * True when `host` is a plain hostname or a CANONICAL dotted IPv4 that resolves
 * to the literal `host:port` endpoint. Beyond the character allow-list, it
 * rejects IPv4 forms the URL parser silently rewrites to a DIFFERENT address —
 * `010.0.0.1` → `8.0.0.1` (octal), `2130706433` / `0x7f000001` / `127.1` →
 * `127.0.0.1` — by round-tripping through `URL` and requiring the parsed
 * hostname (case-insensitive) and port to echo the input unchanged. This keeps
 * the validated/saved host:port the ACTUAL endpoint Tally traffic reaches.
 */
export function isValidTallyHost(host: string): boolean {
  if (host.length === 0 || host.length > 253 || !TALLY_HOST_RE.test(host)) return false;
  try {
    const u = new URL(`http://${host}:9000`);
    return u.hostname === host.toLowerCase() && u.port === "9000" && u.pathname === "/";
  } catch {
    return false;
  }
}
