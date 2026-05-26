import type { TallymcpApi } from "../shared/ipc-types.js";

export interface WindowWithTallyMcp extends Window {
  tallymcp?: TallymcpApi;
}

/**
 * Returns the preload-injected `window.tallymcp`. Throws if the bridge
 * wasn't installed (would indicate a preload script load failure or that
 * the renderer was opened outside Electron, e.g. in browser dev mode).
 */
export function getApi(): TallymcpApi {
  const w = globalThis.window as WindowWithTallyMcp;
  if (!w.tallymcp) {
    throw new Error(
      "tallymcp API not available — the preload bridge did not load. " +
        "This usually means the renderer was opened without Electron, " +
        "or the preload script crashed.",
    );
  }
  return w.tallymcp;
}
