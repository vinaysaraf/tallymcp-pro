import { readFile, copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { parseTallyIni, ensureXmlInterfaceLines, serializeTallyIni } from "./tally-ini.js";
import { addFirewallRule, removeFirewallRule, firewallRuleExists, FIREWALL_RULE_NAME, FirewallElevationError, GroupPolicyError } from "./firewall.js";
import { writeAtomic } from "./atomic-write.js";
import type { ExecRunner } from "./exec-runner.js";
import type { TallyInstall } from "./tally-detect.js";

/**
 * Thrown by {@link TallyAutofixer.fixXmlInterface} when the tally.ini
 * write fails with EPERM/EACCES. The most common causes:
 *
 *   1. TallyPrime is currently running — it holds tally.ini open and
 *      Windows blocks our rename.
 *   2. The user account doesn't have write access to the Tally install
 *      folder (e.g. `C:\Program Files\TallyPrime\`). Either elevate
 *      (run as Administrator) or ask IT for write access on that folder.
 *
 * The message is CA-friendly — surfaces both causes with concrete next
 * steps so the renderer can show it verbatim via ErrorBanner.
 */
export class TallyIniLockedError extends Error {
  constructor(iniPath: string, underlyingMessage: string) {
    super(
      `Couldn't edit tally.ini at ${iniPath}. ` +
        `This usually means TallyPrime is currently running — close it ` +
        `from the system tray, then click Fix again. If that doesn't ` +
        `help, your user account may not have write access to that ` +
        `folder; ask your IT team for write access, or run TallyMCP as ` +
        `Administrator. (Underlying error: ${underlyingMessage})`,
    );
    this.name = "TallyIniLockedError";
  }
}

export interface TallyAutofixerOptions {
  runner: ExecRunner;
}

export interface FixXmlResult {
  action: "applied" | "noop";
  iniBackupCreated: boolean;
}

const TALLY_INI_BAK_SUFFIX = ".tallymcp-bak";

export class TallyAutofixer {
  constructor(private readonly opts: TallyAutofixerOptions) {}

  async fixXmlInterface(install: TallyInstall): Promise<FixXmlResult> {
    const text = await readFile(install.iniPath, "utf8");
    const ini = parseTallyIni(text);

    if (ini.get("Client Server") === "Both" && ini.get("ServerPort") === "9000") {
      return { action: "noop", iniBackupCreated: false };
    }

    // Backup BEFORE writing.
    const backupPath = `${install.iniPath}${TALLY_INI_BAK_SUFFIX}`;
    let iniBackupCreated = false;
    try {
      await access(backupPath, constants.F_OK);
    } catch {
      await copyFile(install.iniPath, backupPath);
      iniBackupCreated = true;
    }

    const updated = ensureXmlInterfaceLines(ini);
    try {
      await writeAtomic(install.iniPath, serializeTallyIni(updated));
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EPERM" || e.code === "EACCES") {
        throw new TallyIniLockedError(install.iniPath, e.message);
      }
      throw err;
    }

    // Verify.
    const verify = parseTallyIni(await readFile(install.iniPath, "utf8"));
    if (verify.get("Client Server") !== "Both" || verify.get("ServerPort") !== "9000") {
      throw new Error(`Verify failed after editing ${install.iniPath}`);
    }

    return { action: "applied", iniBackupCreated };
  }

  async restoreTallyIni(iniPath: string): Promise<void> {
    const backupPath = `${iniPath}${TALLY_INI_BAK_SUFFIX}`;
    await access(backupPath, constants.F_OK); // throw if backup missing
    const backupContent = await readFile(backupPath, "utf8");
    await writeAtomic(iniPath, backupContent);
  }

  async ensureFirewallRule(
    tallyExePath: string,
  ): Promise<"added" | "noop" | "skipped-non-admin" | "group-policy-blocked"> {
    if (await firewallRuleExists(this.opts.runner)) return "noop";
    try {
      await addFirewallRule(this.opts.runner, { tallyExePath });
      return "added";
    } catch (err) {
      if (err instanceof FirewallElevationError) return "skipped-non-admin";
      if (err instanceof GroupPolicyError) return "group-policy-blocked";
      throw err;
    }
  }

  async removeFirewallRuleIfPresent(): Promise<"removed" | "noop" | "skipped-non-admin"> {
    if (!(await firewallRuleExists(this.opts.runner))) return "noop";
    try {
      await removeFirewallRule(this.opts.runner);
      return "removed";
    } catch (err) {
      if (err instanceof FirewallElevationError) return "skipped-non-admin";
      throw err;
    }
  }
}

export { FIREWALL_RULE_NAME };
