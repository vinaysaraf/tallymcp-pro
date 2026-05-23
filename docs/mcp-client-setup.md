# MCP client setup — TallyMCP Pro

This guide wires the TallyMCP stdio server into the AI clients that have native
MCP support today.

> Prerequisites:
> - TallyPrime 4.x running on Windows with a company loaded
> - Tally XML interface ON: F1 (Help) → Settings → Connectivity → Client/Server → **Both**, port **9000**
> - Windows Firewall allowing inbound TCP 9000 (Private profile)
> - `pnpm install && pnpm build` has completed in the repo

## Where the server lives

The compiled entry is at:

```
<repo>/apps/mcp-server/dist/main.js
```

It expects `TALLYMCP_CONFIG` in the environment pointing at a writable JSON
file. If the file does not exist the server creates it with safe defaults
(`security.readOnly: true`, local Tally at `127.0.0.1:9000`,
output folder `./tallymcp-output`).

You can also call the `tally_export_mcp_config` tool from inside a running
session to print a ready-made snippet for your client.

## Cursor

Edit `.cursor/mcp.json` in your project root, or your global Cursor MCP config:

```json
{
  "mcpServers": {
    "tallymcp-pro": {
      "command": "node",
      "args": ["C:/Projects/Tally MCP/apps/mcp-server/dist/main.js"],
      "env": {
        "TALLYMCP_CONFIG": "C:/Users/YOU/AppData/Roaming/TallyMCP/config.json"
      }
    }
  }
}
```

Restart Cursor. The server appears under the MCP integrations panel; the 15
tools are then callable from any chat.

## Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "tallymcp-pro": {
      "command": "node",
      "args": ["C:/Projects/Tally MCP/apps/mcp-server/dist/main.js"],
      "env": {
        "TALLYMCP_CONFIG": "C:/Users/YOU/AppData/Roaming/TallyMCP/config.json"
      }
    }
  }
}
```

Restart Claude Desktop. Hover the bottom-right indicator to confirm the server
is connected.

## LM Studio

LM Studio (≥ 0.3) supports MCP via *Developer → MCP servers*. Add the same
snippet under the `tallymcp-pro` key. The local model now sees the 15 tools.

## Ollama (via a bridge)

Ollama does not yet ship an MCP client. Use a bridge such as `mcp-bridge` and
launch the stdio command:

```powershell
$env:TALLYMCP_CONFIG = "C:\Users\YOU\AppData\Roaming\TallyMCP\config.json"
node "C:\Projects\Tally MCP\apps\mcp-server\dist\main.js"
```

## First-time sanity check

In any wired client, ask the model to call **`tally_test_connection`**. A
healthy setup returns `{ "ok": true, "code": "OK", "companiesLoaded": N }`.
If you see `ok: false`, the diagnostic `hint` field will tell you which knob
to flip (Tally not running, XML off, no company loaded, port refused, firewall).

## Output folder

Generated `.xlsx`, `.csv`, and `audit-result.json` files land in the
`output.folder` configured in your `config.json` (default
`./tallymcp-output`). Each file is also returned to the client as a
`GeneratedFile` record (path + MIME + size).
