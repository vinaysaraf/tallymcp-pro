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
import { AbortError, assertInteractiveOrYes, formatPreview, readStdinConfirm, type ConfirmFn } from "../confirm.js";

export interface RunTallyRestoreOptions {
  scanRoots?: string[];
  runner?: ExecRunner;
  tallyDir?: string;
  /** When true, skip the interactive confirmation prompt. */
  yes?: boolean;
  /** Override the default stdin reader (used by tests). */
  confirmFn?: ConfirmFn;
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

  // Build and display preview before touching any files.
  const iniItem =
    `Restore  ${install.iniPath}\n` +
    `from its backup at ${install.iniPath}.tallymcp-bak.`;

  const fwItem =
    `Remove the Windows Firewall rule\n` +
    `name = "TallyMCP — Tally XML port 9000"`;

  const preview = formatPreview("I will make 2 changes to your PC:", [iniItem, fwItem]);
  process.stdout.write(preview);

  assertInteractiveOrYes({ yes: opts.yes });

  if (!(opts.yes ?? false)) {
    const confirmFn = opts.confirmFn ?? readStdinConfirm;
    const confirmed = await confirmFn("Proceed? [y/N] ");
    if (!confirmed) throw new AbortError();
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
