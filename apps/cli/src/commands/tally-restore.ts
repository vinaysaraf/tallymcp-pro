import { join } from "node:path";
import {
  detectTallyInstall,
  detectTallyRunning,
  waitForTallyClose,
  TallyAutofixer,
  RealExecRunner,
  type ExecRunner,
  type TallyInstall,
} from "@tallymcp/tally-autofix";

export interface RunTallyRestoreOptions {
  scanRoots?: string[];
  runner?: ExecRunner;
  tallyDir?: string;
}

export async function runTallyRestoreCommand(
  opts: RunTallyRestoreOptions = {},
): Promise<void> {
  const runner = opts.runner ?? new RealExecRunner();

  let install: TallyInstall;
  if (opts.tallyDir) {
    install = {
      installDir: opts.tallyDir,
      exePath: join(opts.tallyDir, "tally.exe"),
      iniPath: join(opts.tallyDir, "tally.ini"),
    };
  } else {
    const found = (await detectTallyInstall({
      scanRoots: opts.scanRoots,
      returnAll: true,
    })) as TallyInstall[];
    if (found.length === 0) throw new Error("TallyPrime install not detected.");
    if (found.length > 1) {
      const list = found.map((i) => `  - ${i.installDir}`).join("\n");
      throw new Error(
        `Multiple TallyPrime installs found. Please pick one with --tally-dir:\n${list}`,
      );
    }
    install = found[0]!;
  }

  if (await detectTallyRunning(runner)) {
    console.log("Please close TallyPrime first.");
    const closed = await waitForTallyClose(runner, { pollMs: 1000, timeoutMs: 60_000 });
    if (!closed) throw new Error("TallyPrime is still running.");
  }
  const fixer = new TallyAutofixer({ runner });
  await fixer.restoreTallyIni(install.iniPath);
  await fixer.removeFirewallRuleIfPresent();
}
