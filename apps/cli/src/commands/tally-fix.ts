import { join } from "node:path";
import {
  detectTallyInstall,
  detectTallyRunning,
  waitForTallyClose,
  TallyAutofixer,
  type ExecRunner,
  RealExecRunner,
  type TallyInstall,
} from "@tallymcp/tally-autofix";

export interface RunTallyFixOptions {
  /** Override scan roots (defaults: Program Files / Program Files (x86)). */
  scanRoots?: string[];
  /** Override the exec runner (defaults: RealExecRunner). */
  runner?: ExecRunner;
  /**
   * Explicit Tally install directory. If set, skip auto-detection and use
   * this one. Required when multiple installs exist on the machine.
   */
  tallyDir?: string;
}

export interface TallyFixResult {
  install: TallyInstall;
  xmlInterface: "applied" | "noop";
  firewallRule: "added" | "noop";
}

export async function runTallyFixCommand(opts: RunTallyFixOptions = {}): Promise<TallyFixResult> {
  const runner = opts.runner ?? new RealExecRunner();

  // Resolve which install to operate on.
  let install: TallyInstall;
  if (opts.tallyDir) {
    // Explicit path → trust the user. Build the TallyInstall record by hand.
    // Use path.join so test code on Linux/macOS sees forward slashes and
    // production code on Windows sees backslashes — both correct for their OS.
    install = {
      installDir: opts.tallyDir,
      exePath: join(opts.tallyDir, "tally.exe"),
      iniPath: join(opts.tallyDir, "tally.ini"),
    };
  } else {
    // No explicit path → ask for ALL installs so we can tell the user
    // which ones exist when more than one is found.
    const found = (await detectTallyInstall({
      scanRoots: opts.scanRoots,
      returnAll: true,
    })) as TallyInstall[];
    if (found.length === 0) {
      throw new Error(
        "TallyPrime is not installed in the standard locations. " +
          "Install it from https://tallysolutions.com, then retry.",
      );
    }
    if (found.length > 1) {
      const list = found.map((i) => `  - ${i.installDir}`).join("\n");
      throw new Error(
        `Multiple TallyPrime installs found. Please pick one with --tally-dir:\n${list}`,
      );
    }
    install = found[0]!;
  }

  // If Tally is running, ask the user to close it. The CLI does NOT auto-close.
  if (await detectTallyRunning(runner)) {
    console.log("Please close TallyPrime, then I'll continue.");
    const closed = await waitForTallyClose(runner, { pollMs: 1000, timeoutMs: 60_000 });
    if (!closed) {
      throw new Error("TallyPrime is still running. Close it from the system tray and retry.");
    }
  }

  const fixer = new TallyAutofixer({ runner });
  const xml = await fixer.fixXmlInterface(install);
  const fw = await fixer.ensureFirewallRule(install.exePath);

  return { install, xmlInterface: xml.action, firewallRule: fw };
}
