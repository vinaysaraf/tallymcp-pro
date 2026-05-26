import { readFile } from "node:fs/promises";
import {
  ClientWirer,
  CLIENT_REGISTRY,
  resolveClientConfigPath,
  type ClientId,
} from "@tallymcp/client-wirer";
import {
  detectTallyInstall,
  TallyAutofixer,
  RealExecRunner,
  type ExecRunner,
  type TallyInstall,
} from "@tallymcp/tally-autofix";

const ALL_CLIENT_IDS: ClientId[] = [
  "claude-desktop",
  "cursor",
  "claude-code",
  "lm-studio",
  "ollama",
];

export interface UninstallCleanupContext {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Override scan roots for Tally detection (tests). */
  scanRoots?: string[];
  /** Override the exec runner (tests inject FakeExecRunner). */
  runner?: ExecRunner;
}

export interface UninstallCleanupResult {
  /** Subset of ALL_CLIENT_IDS whose configs had tallymcp-pro removed. */
  clientsUnwired: ClientId[];
  /** True if tally.ini was restored from .tallymcp-bak. */
  tallyIniRestored: boolean;
  /** Outcome of the firewall rule removal attempt. */
  firewallRule: "removed" | "noop" | "skipped-non-admin";
  /**
   * Diagnostic messages — written to console.log by the CLI entry point.
   * Tests can also assert on this for visibility.
   */
  messages: string[];
}

/**
 * Runs the no-UI cleanup invoked by NSIS uninstall (and runnable manually
 * via `TallyMCP --uninstall-cleanup`). Never throws — every failure is
 * captured in the result so the uninstaller can continue even when an
 * individual step fails (e.g., one of the 5 AI client configs is
 * malformed, or Tally was uninstalled before TallyMCP).
 */
export async function runUninstallCleanup(
  ctx: UninstallCleanupContext = {},
): Promise<UninstallCleanupResult> {
  const env = ctx.env ?? process.env;
  const runner = ctx.runner ?? new RealExecRunner();
  const messages: string[] = [];
  const clientsUnwired: ClientId[] = [];

  // 1. Unwire each AI client that has a tallymcp-pro entry.
  for (const id of ALL_CLIENT_IDS) {
    try {
      const configPath = resolveClientConfigPath(id, env);
      let raw: string;
      try {
        raw = await readFile(configPath, "utf8");
      } catch {
        messages.push(`[${id}] no config at ${configPath} — skipping`);
        continue;
      }
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const serversKey = CLIENT_REGISTRY[id].serversKey;
      const servers = parsed[serversKey] as Record<string, unknown> | undefined;
      if (!servers || !("tallymcp-pro" in servers)) {
        messages.push(`[${id}] no tallymcp-pro entry — skipping`);
        continue;
      }
      const wirer = new ClientWirer({
        env,
        entry: { command: "(unused-for-remove)", args: [] },
      });
      const result = await wirer.remove(id);
      if (result.action === "removed") {
        clientsUnwired.push(id);
        messages.push(`[${id}] removed tallymcp-pro from ${result.configPath}`);
      } else {
        messages.push(`[${id}] remove returned action=${result.action}`);
      }
    } catch (err) {
      messages.push(`[${id}] cleanup failed: ${(err as Error).message}`);
    }
  }

  // 2. Restore tally.ini from .tallymcp-bak (if present).
  let tallyIniRestored = false;
  try {
    const found = (await detectTallyInstall({
      scanRoots: ctx.scanRoots,
      returnAll: true,
    })) as TallyInstall[];
    if (found.length > 0) {
      // Restore on every found install (handles the rare multi-install case).
      const fixer = new TallyAutofixer({ runner });
      for (const install of found) {
        try {
          await fixer.restoreTallyIni(install.iniPath);
          tallyIniRestored = true;
          messages.push(`restored tally.ini at ${install.iniPath} from .tallymcp-bak`);
        } catch (err) {
          messages.push(
            `tally.ini restore at ${install.iniPath} failed: ${(err as Error).message}`,
          );
        }
      }
    } else {
      messages.push("no TallyPrime install detected — skipping tally.ini restore");
    }
  } catch (err) {
    messages.push(`tally.ini restore step failed: ${(err as Error).message}`);
  }

  // 3. Remove the firewall rule (if present + admin).
  let firewallRule: UninstallCleanupResult["firewallRule"] = "noop";
  try {
    const fixer = new TallyAutofixer({ runner });
    firewallRule = await fixer.removeFirewallRuleIfPresent();
    messages.push(`firewall rule cleanup: ${firewallRule}`);
  } catch (err) {
    messages.push(`firewall cleanup failed: ${(err as Error).message}`);
    firewallRule = "noop";
  }

  return { clientsUnwired, tallyIniRestored, firewallRule, messages };
}
