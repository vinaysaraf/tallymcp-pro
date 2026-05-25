import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  firewallRuleExists,
  addFirewallRule,
  removeFirewallRule,
  FIREWALL_RULE_NAME,
} from "../src/firewall.js";
import { FakeExecRunner } from "../src/exec-runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const presentFixture = join(HERE, "fixtures", "netsh-show-rule-present.txt");
const absentFixture = join(HERE, "fixtures", "netsh-show-rule-absent.txt");

describe("firewallRuleExists", () => {
  it("returns true when netsh shows our rule", async () => {
    const stdout = await readFile(presentFixture, "utf8");
    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout, stderr: "" }));
    expect(await firewallRuleExists(runner)).toBe(true);
  });

  it("returns false when netsh says no rules match", async () => {
    const stdout = await readFile(absentFixture, "utf8");
    const runner = new FakeExecRunner(() => ({ exitCode: 1, stdout, stderr: "" }));
    expect(await firewallRuleExists(runner)).toBe(false);
  });
});

describe("addFirewallRule", () => {
  it("runs netsh advfirewall firewall add rule with the expected args", async () => {
    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "Ok.", stderr: "" }));
    await addFirewallRule(runner, { tallyExePath: "C:\\Program Files\\TallyPrime\\tally.exe" });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe("netsh");
    expect(runner.calls[0]?.args).toEqual([
      "advfirewall", "firewall", "add", "rule",
      `name="${FIREWALL_RULE_NAME}"`,
      "dir=in",
      "action=allow",
      "protocol=TCP",
      "localport=9000",
      `program="C:\\Program Files\\TallyPrime\\tally.exe"`,
      "profile=private",
      "enable=yes",
    ]);
  });

  it("produces quoted program= arg even when path contains spaces", async () => {
    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "Ok.", stderr: "" }));
    await addFirewallRule(runner, { tallyExePath: "C:\\Program Files\\TallyPrime (1)\\tally.exe" });
    expect(runner.calls[0]?.args).toContain(
      `program="C:\\Program Files\\TallyPrime (1)\\tally.exe"`,
    );
  });

  it("throws when netsh reports Group Policy denial", async () => {
    const runner = new FakeExecRunner(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Group Policy disallows this operation.",
    }));
    await expect(
      addFirewallRule(runner, { tallyExePath: "C:\\tally.exe" }),
    ).rejects.toThrow(/Group Policy/);
  });
});

describe("removeFirewallRule", () => {
  it("runs netsh delete with the right rule name", async () => {
    const runner = new FakeExecRunner(() => ({ exitCode: 0, stdout: "Deleted 1 rule(s).", stderr: "" }));
    await removeFirewallRule(runner);
    expect(runner.calls[0]?.args).toEqual([
      "advfirewall", "firewall", "delete", "rule",
      `name="${FIREWALL_RULE_NAME}"`,
    ]);
  });
});
