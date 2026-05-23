#!/usr/bin/env tsx
/**
 * Posts the canonical List of Companies envelope (Appendix A.1) to Tally XML HTTP.
 *
 * Usage:
 *   pnpm hello-tally                          # live Tally (Windows local or LAN)
 *   pnpm hello-tally:fixture                  # Mac/offline — validate envelope + fixture
 *   TALLY_HOST=192.168.1.50 pnpm hello-tally  # Tally on another machine
 */
import { TallyHttpClient } from "@tallymcp/tally-connector";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUEST_PATH = join(process.cwd(), "samples/list-companies.request.xml");
const FIXTURE_RESPONSE_PATH = join(process.cwd(), "samples/list-companies.response.xml");

function printUsage() {
  console.log(`TallyMCP hello-tally — test Tally XML connectivity

Usage:
  pnpm hello-tally              Connect to live Tally (HTTP POST)
  pnpm hello-tally:fixture      Offline check using samples/ fixtures (Mac dev)
  pnpm hello-tally --help       Show this help

Environment:
  TALLY_HOST   Tally host (default: 127.0.0.1)
  TALLY_PORT   Tally XML port (default: 9000)

Mac developers:
  TallyPrime does not run on macOS. Use one of:
  1. pnpm hello-tally:fixture     — completes Phase 0 envelope check on Mac
  2. TALLY_HOST=<windows-ip>    — point at Tally on a Windows PC on your LAN
  3. Windows VM with TallyPrime — full local integration

On the Windows Tally machine:
  F1 → Settings → Connectivity → Client/Server → Both, port 9000
  Allow inbound TCP 9000 in Windows Firewall for LAN access.
`);
}

function readEnvelope(): string {
  if (!existsSync(REQUEST_PATH)) {
    throw new Error(`Missing request fixture: ${REQUEST_PATH}`);
  }
  return readFileSync(REQUEST_PATH, "utf8");
}

function printResponse(label: string, text: string, maxLen = 2000) {
  console.log(label);
  console.log(text.slice(0, maxLen));
  if (text.length > maxLen) {
    console.log(`\n... (${text.length} bytes total)`);
  }
}

function runFixtureMode() {
  const envelope = readEnvelope();
  if (!envelope.includes("<ID>List of Companies</ID>")) {
    throw new Error("Request fixture does not look like a List of Companies envelope.");
  }

  if (!existsSync(FIXTURE_RESPONSE_PATH)) {
    throw new Error(`Missing response fixture: ${FIXTURE_RESPONSE_PATH}`);
  }

  const fixture = readFileSync(FIXTURE_RESPONSE_PATH, "utf8");
  console.log("[hello-tally] fixture mode — no network call (Mac/offline dev)\n");
  console.log(`Request envelope: ${REQUEST_PATH} (${envelope.length} bytes)`);
  console.log("Envelope preview:");
  printResponse("", envelope.trim(), 600);
  console.log("\nExpected response shape (from samples/list-companies.response.xml):");
  printResponse("", fixture.trim(), 1200);
  console.log(
    "\n[hello-tally] fixture OK — envelope valid. For live Tally, set TALLY_HOST to your Windows machine IP.",
  );
}

async function runLiveMode(host: string, port: string) {
  const envelope = readEnvelope();
  const portNum = Number(port);
  const url = `http://${host}:${port}/`;

  console.log(`[hello-tally] live mode — POST ${url}\n`);

  if (process.platform === "darwin" && host === "127.0.0.1") {
    console.log(
      "Note: TallyPrime does not run on macOS. 127.0.0.1 will only work if you port-forward",
    );
    console.log(
      "to a Windows Tally host. Use TALLY_HOST=<windows-lan-ip> or pnpm hello-tally:fixture.\n",
    );
  }

  const client = new TallyHttpClient({
    host,
    port: portNum,
    timeoutMs: 30_000,
    serialize: true,
  });

  try {
    const text = await client.post(envelope);
    console.log("Status: 200");
    printResponse("", text);
  } catch {
    process.exitCode = 1;
    throw new Error(`Tally HTTP request failed for ${url}`);
  }
}

function connectionHelp(err: Error, host: string, port: string) {
  console.error(`\n[hello-tally] ${err.message}`);

  if (process.platform === "darwin") {
    console.error(`
On MacBook, TallyPrime is not installed locally. Options:

  A) Offline (Phase 0 on Mac):
     pnpm hello-tally:fixture

  B) Live Tally on a Windows PC (same Wi‑Fi/LAN):
     1. Enable XML on Tally: F1 → Settings → Connectivity → Both, port ${port}
     2. Note the Windows PC IP (ipconfig → IPv4)
     3. Allow TCP ${port} in Windows Firewall
     4. Run: TALLY_HOST=<windows-ip> pnpm hello-tally

  C) Windows VM with TallyPrime (Parallels/UTM):
     Use the VM's IP as TALLY_HOST
`);
    return;
  }

  console.error(`
Could not reach Tally at ${host}:${port}.
- Is TallyPrime running?
- Is XML enabled (Client/Server → Both, port ${port})?
- Is a company loaded?
`);
}

async function main() {
  const arg = process.argv[2];

  if (arg === "--help" || arg === "-h") {
    printUsage();
    return;
  }

  if (arg === "--fixture" || arg === "fixture") {
    runFixtureMode();
    return;
  }

  const host = process.env.TALLY_HOST ?? "127.0.0.1";
  const port = process.env.TALLY_PORT ?? "9000";

  try {
    await runLiveMode(host, port);
  } catch (err) {
    connectionHelp(err instanceof Error ? err : new Error(String(err)), host, port);
    process.exit(1);
  }
}

main();
