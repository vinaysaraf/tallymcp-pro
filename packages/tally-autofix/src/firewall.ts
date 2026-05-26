import type { ExecRunner } from "./exec-runner.js";

export const FIREWALL_RULE_NAME = "TallyMCP — Tally XML port 9000" as const;

export class FirewallElevationError extends Error {
  constructor() {
    super(
      "Adding the Windows Firewall rule requires Administrator privileges. " +
        "Loopback (127.0.0.1:9000) works without it — for multi-machine setups, " +
        "re-run from an elevated terminal.",
    );
    this.name = "FirewallElevationError";
  }
}

/**
 * Returns true if a firewall rule with our exact name exists.
 * `netsh advfirewall firewall show rule name=<X>` exits non-zero when not found.
 */
export async function firewallRuleExists(runner: ExecRunner): Promise<boolean> {
  const result = await runner.run("netsh", [
    "advfirewall", "firewall", "show", "rule",
    `name="${FIREWALL_RULE_NAME}"`,
  ]);
  if (result.exitCode !== 0) return false;
  // Defensive: also check stdout for "No rules match" — some Windows builds
  // return exit 0 with that message instead of non-zero.
  return !/no rules match/i.test(result.stdout);
}

export interface AddFirewallRuleOptions {
  /** Absolute path to tally.exe (used as the rule's program scope). */
  tallyExePath: string;
}

export async function addFirewallRule(
  runner: ExecRunner,
  opts: AddFirewallRuleOptions,
): Promise<void> {
  const result = await runner.run("netsh", [
    "advfirewall", "firewall", "add", "rule",
    `name="${FIREWALL_RULE_NAME}"`,
    "dir=in",
    "action=allow",
    "protocol=TCP",
    "localport=9000",
    `program="${opts.tallyExePath}"`,
    "profile=private",
    "enable=yes",
  ]);
  if (result.exitCode !== 0) {
    if (/group policy/i.test(result.stderr)) {
      throw new Error(
        "Group Policy disallows firewall changes. Ask your IT team to allow inbound TCP 9000 for TallyPrime.",
      );
    }
    if (result.stderr.trim() === "") {
      throw new FirewallElevationError();
    }
    throw new Error(
      `Failed to add firewall rule (exit ${result.exitCode}). stderr: ${result.stderr.trim() || "(empty)"}`,
    );
  }
}

export async function removeFirewallRule(runner: ExecRunner): Promise<void> {
  const result = await runner.run("netsh", [
    "advfirewall", "firewall", "delete", "rule",
    `name="${FIREWALL_RULE_NAME}"`,
  ]);
  // Delete on a missing rule returns non-zero; that's a noop from our POV.
  if (result.exitCode !== 0 && !/no rules match/i.test(result.stdout + result.stderr)) {
    throw new Error(
      `Failed to remove firewall rule (exit ${result.exitCode}). stderr: ${result.stderr.trim() || "(empty)"}`,
    );
  }
}
