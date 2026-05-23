#!/usr/bin/env tsx
/**
 * Scan the local Wi-Fi subnet for Tally XML (HTTP port 9000).
 * Usage: pnpm scan-tally
 */
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { request } from "undici";

function getLocalIpv4(): { ip: string; prefix: number } | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        const prefix = Number(iface.cidr?.split("/")[1] ?? 24);
        return { ip: iface.address, prefix };
      }
    }
  }
  return null;
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0);
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function subnetHosts(ip: string, prefix: number): string[] {
  const mask = prefix === 32 ? 0xffffffff : (~0 << (32 - prefix)) >>> 0;
  const base = ipToInt(ip) & mask;
  const broadcast = base | (~mask >>> 0);
  const hosts: string[] = [];
  for (let h = base + 1; h < broadcast; h++) {
    hosts.push(intToIp(h >>> 0));
  }
  return hosts;
}

async function probeTally(ip: string, envelope: string): Promise<boolean> {
  try {
    const { statusCode, body } = await request(`http://${ip}:9000/`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: envelope,
      headersTimeout: 2000,
      bodyTimeout: 4000,
    });
    const text = await body.text();
    return statusCode === 200 && text.includes("ENVELOPE");
  } catch {
    return false;
  }
}

async function main() {
  const local = getLocalIpv4();
  if (!local) {
    console.error("[scan-tally] No active Wi-Fi/Ethernet IPv4 address found.");
    process.exit(1);
  }

  const envelope = readFileSync(
    join(process.cwd(), "samples/list-companies.request.xml"),
    "utf8",
  );

  const hosts = subnetHosts(local.ip, local.prefix);
  console.log(`[scan-tally] Your Mac: ${local.ip}/${local.prefix}`);
  console.log(`[scan-tally] Scanning ${hosts.length} hosts on port 9000 (Tally XML)...\n`);

  const found: string[] = [];
  const batchSize = 20;

  for (let i = 0; i < hosts.length; i += batchSize) {
    const batch = hosts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (ip) => ({ ip, ok: await probeTally(ip, envelope) })),
    );
    for (const { ip, ok } of results) {
      if (ok) {
        found.push(ip);
        console.log(`  FOUND  ${ip}:9000  — Tally XML responded`);
      }
    }
  }

  console.log("");
  if (found.length === 0) {
    console.log("[scan-tally] No Tally found on this network.");
    console.log(`
Next steps on your Windows laptop:
  1. Open TallyPrime and load a company
  2. F1 → Settings → Connectivity → Client/Server → Both, port 9000
  3. Windows Firewall → allow inbound TCP 9000 (Private network)
  4. Run: ipconfig  →  note IPv4 (e.g. 192.168.30.xx)
  5. Re-run: pnpm scan-tally

Or test directly:
  TALLY_HOST=<windows-ip> pnpm hello-tally
`);
    process.exit(1);
  }

  console.log("[scan-tally] Connect with:");
  for (const ip of found) {
    console.log(`  TALLY_HOST=${ip} pnpm hello-tally`);
  }
}

main();
