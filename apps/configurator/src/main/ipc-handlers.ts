import { join } from "node:path";
import { ClientWirer, type McpServerEntry } from "@tallymcp/client-wirer";
import {
  IPC_CHANNELS,
  type WireRequest,
  type WireResponse,
  type UnwireRequest,
  type UnwireResponse,
} from "../shared/ipc-types.js";

/**
 * Test injection point — production callers pass nothing and we use
 * process.env; tests inject a synthetic env so we don't touch real
 * %APPDATA% during unit tests.
 */
export interface HandlerContext {
  env?: Record<string, string | undefined>;
}

export async function handleWireMcp(
  req: WireRequest,
  ctx: HandlerContext = {},
): Promise<WireResponse> {
  const entry: McpServerEntry = {
    command: join(req.installDir, "node.exe"),
    args: [join(req.installDir, "mcp-server", "main.js")],
    env: { TALLYMCP_CONFIG: join(req.installDir, "config.json") },
  };
  const wirer = new ClientWirer({ env: ctx.env ?? process.env, entry });
  return wirer.add(req.clientId);
}

export async function handleUnwireMcp(
  req: UnwireRequest,
  ctx: HandlerContext = {},
): Promise<UnwireResponse> {
  // remove() doesn't need a real entry — pass a stub.
  const wirer = new ClientWirer({
    env: ctx.env ?? process.env,
    entry: { command: "(unused-for-remove)", args: [] },
  });
  return wirer.remove(req.clientId);
}

/**
 * Registers IPC handlers on the supplied ipcMain. Called once at Electron
 * `app.ready`. Tests invoke the `handle*` functions directly.
 */
export function registerIpcHandlers(
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => void },
): void {
  ipcMain.handle(IPC_CHANNELS.WIRE_MCP, (_evt, payload) => handleWireMcp(payload as WireRequest));
  ipcMain.handle(IPC_CHANNELS.UNWIRE_MCP, (_evt, payload) => handleUnwireMcp(payload as UnwireRequest));
}
