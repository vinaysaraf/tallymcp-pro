# Mac Developer Setup

TallyPrime runs on **Windows only**. You can develop TallyMCP on a MacBook; live Tally integration uses a Windows host on your network or a VM.

## What works on Mac without Tally

```bash
npx pnpm@9 install
npx pnpm@9 build
npx pnpm@9 test
npx pnpm@9 hello-tally:fixture
```

`hello-tally:fixture` validates the List of Companies request envelope and prints the expected response shape from `samples/` — this satisfies **Phase 0 M0.4** envelope work on Mac.

## Live Tally from Mac (LAN)

Use a Windows PC (or VM) on the same network with TallyPrime running.

### On the Windows Tally machine

1. Open TallyPrime and load a company.
2. **F1 → Help → Settings → Connectivity → Client/Server Configuration**
3. Set **TallyPrime acts as:** **Both**
4. Port: **9000**
5. Save and restart Tally if prompted.
6. Open **Windows Firewall** → allow inbound **TCP 9000** (private network).
7. Find the PC IP: `ipconfig` → IPv4 (e.g. `192.168.1.50`).

### On your MacBook

**Option A — auto-scan the Wi‑Fi network** (after Windows setup below):

```bash
npx pnpm@9 scan-tally
```

**Option B — use the Windows IP directly** (`ipconfig` on Windows → IPv4):

```bash
TALLY_HOST=192.168.30.xx npx pnpm@9 hello-tally
```

Your Mac is on **`192.168.30.x`** — the Windows laptop will have a similar address (not `.14`, which is your Mac).

### Troubleshooting

| Symptom | Fix |
|---|---|
| Connection refused | Tally not running, or XML not set to Both |
| Timeout | Wrong IP, firewall blocking 9000, different subnet/VPN |
| Timeout (co-working Wi‑Fi) | **Client isolation** — see [Co-working space](#co-working-space) below |
| Empty or error XML | No company loaded in Tally |

## Co-working space

Most co-working and hotel Wi‑Fi uses **client isolation** (AP isolation): your Mac and Windows laptop get internet, but **cannot talk to each other**. Tally, firewall, and IP can all be correct and you still get **timeout**.

**How to tell:** Mac can reach the router but not your Windows IP (`ping 192.168.30.10` fails while Tally shows `LISTENING` on Windows).

### Workarounds (pick one)

| Option | Effort | Best for |
|---|---|---|
| **Phone hotspot** | Low | Quick test today — connect **both** Mac and Windows to your phone’s hotspot |
| **Windows mobile hotspot** | Low | Windows shares its internet; Mac joins **that** Wi‑Fi (mini private LAN) |
| **Tailscale** (free) | Medium | Ongoing dev — both machines join same virtual network; use Tailscale IP as `TALLY_HOST` |
| **Develop on Windows** | Low | Run `hello-tally` locally on Windows (`127.0.0.1`) |
| **Fixture mode on Mac** | None | Phase 0 coding without live Tally: `pnpm hello-tally:fixture` |

#### Phone hotspot (fastest)

1. Enable hotspot on your phone.
2. Connect **Windows laptop** to the hotspot.
3. Connect **MacBook** to the **same** hotspot.
4. On Windows: `ipconfig` → new IPv4 (e.g. `192.168.43.x`).
5. On Mac: `TALLY_HOST=<that-ip> pnpm hello-tally`

#### Windows mobile hotspot

1. Windows **Settings → Network & Internet → Mobile hotspot** → On.
2. Connect Mac to the network name shown (e.g. `DESKTOP-…`).
3. On Windows: `ipconfig` → IP on the hotspot adapter.
4. On Mac: `TALLY_HOST=<hotspot-ip> pnpm hello-tally`

#### Tailscale (good for regular co-working dev)

1. Install [Tailscale](https://tailscale.com) on Mac and Windows (same account).
2. On Windows: `tailscale ip -4` → e.g. `100.x.x.x`
3. Allow Tally through Windows Firewall for **Tailscale** adapter if needed.
4. On Mac: `TALLY_HOST=100.x.x.x pnpm hello-tally`

Data stays on your machines (encrypted mesh). Do not expose Tally to the public internet.


## Capture real fixtures (M0.4)

After a successful live `hello-tally`, save the response:

```bash
TALLY_HOST=192.168.1.50 npx pnpm@9 hello-tally > samples/list-companies.response.live.xml
```

Commit sanitized samples (no client secrets) under `samples/`.

## Windows VM option

Parallels, VMware Fusion, or UTM with Windows 11 + TallyPrime gives a self-contained dev environment. Use the VM's LAN IP as `TALLY_HOST`.

## Phase 0 acceptance on Mac

| Criterion | Mac approach |
|---|---|
| Repo builds/tests | `pnpm build && pnpm test` |
| XML escape/date helpers | Unit tests in `@tallymcp/tally-xml` |
| Hello-world envelope | `pnpm hello-tally:fixture` |
| Live Tally response | `TALLY_HOST=… pnpm hello-tally` when Windows host available |
