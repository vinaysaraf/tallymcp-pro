export { TallyAutofixer, FIREWALL_RULE_NAME, TallyIniLockedError } from "./autofix.js";
export type { TallyAutofixerOptions, FixXmlResult } from "./autofix.js";
export {
  detectTallyInstall,
  type TallyInstall,
  type DetectOptions,
} from "./tally-detect.js";
export {
  detectTallyRunning,
  waitForTallyClose,
  waitForTallyHttp,
  type WaitOptions,
  type WaitForHttpOptions,
} from "./tally-process.js";
export {
  RealExecRunner,
  FakeExecRunner,
  type ExecRunner,
  type ExecResult,
} from "./exec-runner.js";
export {
  parseTallyIni,
  serializeTallyIni,
  ensureXmlInterfaceLines,
  TallyIni,
} from "./tally-ini.js";
export {
  firewallRuleExists,
  addFirewallRule,
  removeFirewallRule,
  FirewallElevationError,
  GroupPolicyError,
  type AddFirewallRuleOptions,
} from "./firewall.js";
export { detectIsElevated } from "./elevation.js";
