import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { parseTallyIni, ensureXmlInterfaceLines, serializeTallyIni } from "./tally-ini.js";
import { addFirewallRule, removeFirewallRule, firewallRuleExists, FIREWALL_RULE_NAME } from "./firewall.js";
import type { ExecRunner } from "./exec-runner.js";
import type { TallyInstall } from "./tally-detect.js";

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
    await writeFile(install.iniPath, serializeTallyIni(updated), "utf8");

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
    await copyFile(backupPath, iniPath);
  }

  async ensureFirewallRule(tallyExePath: string): Promise<"added" | "noop"> {
    if (await firewallRuleExists(this.opts.runner)) return "noop";
    await addFirewallRule(this.opts.runner, { tallyExePath });
    return "added";
  }

  async removeFirewallRuleIfPresent(): Promise<void> {
    await removeFirewallRule(this.opts.runner);
  }
}

export { FIREWALL_RULE_NAME };
