import type { Finding } from "@tallymcp/shared-types";
import { DEFAULT_MATERIALITY, type DataQualityContext } from "./context.js";

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const includesAny = (s: string, needles: string[]): boolean => {
  const lower = norm(s);
  return needles.some((n) => lower.includes(n));
};

const CREDITOR_NAMES = ["creditor", "supplier", "vendor", "payable"];
const DEBTOR_NAMES = ["debtor", "customer", "receivable"];
const TAX_TOKENS = ["gst", "cgst", "sgst", "igst", "tds", "tcs", "cess", "vat"];
const INCOME_GROUPS = ["sales accounts", "direct incomes", "indirect incomes"];
const EXPENSE_GROUPS = ["purchase accounts", "direct expenses", "indirect expenses"];
const INCOME_NAMES = ["sales", "revenue", "income", "fees", "interest received"];
const EXPENSE_NAMES = ["expense", "purchase", "rent paid", "salary", "fee paid", "interest paid"];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][\dA-Z]Z[\dA-Z]$/;

function finding(
  code: string,
  severity: Finding["severity"],
  title: string,
  description: string,
  evidence: string[],
  suggestedFix: string,
): Finding {
  return { code, severity, title, description, evidence, suggestedFix };
}

// ─── Ledger checks ───────────────────────────────────────────────────────────

function checkDuplicateLedgers(ctx: DataQualityContext): Finding[] {
  const groups = new Map<string, string[]>();
  for (const l of ctx.ledgers) {
    const key = norm(l.name);
    const list = groups.get(key) ?? [];
    list.push(l.name);
    groups.set(key, list);
  }
  return [...groups.values()]
    .filter((names) => names.length > 1)
    .map((names) =>
      finding(
        "DQ.LEDGER.DUPLICATE",
        "high",
        "Duplicate ledger names",
        `${names.length} ledgers share the same normalized name "${norm(names[0]!)}".`,
        names,
        "Merge the duplicates into one ledger, or rename them to be distinct.",
      ),
    );
}

function checkDuplicateGstin(ctx: DataQualityContext): Finding[] {
  const byGstin = new Map<string, string[]>();
  for (const l of ctx.ledgers) {
    if (!l.gstin) continue;
    const list = byGstin.get(l.gstin) ?? [];
    list.push(l.name);
    byGstin.set(l.gstin, list);
  }
  return [...byGstin.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([gstin, names]) =>
      finding(
        "DQ.LEDGER.DUPLICATE_GSTIN",
        "high",
        "Duplicate GSTIN across ledgers",
        `GSTIN ${gstin} is used by ${names.length} different ledgers.`,
        [gstin, ...names],
        "Investigate which ledger should keep the GSTIN; clear it on the others.",
      ),
    );
}

function isPartyLedger(parent: string): boolean {
  return includesAny(parent, ["sundry debtor", "sundry creditor"]);
}

function checkNoGstin(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter((l) => isPartyLedger(l.parent) && !l.gstin)
    .map((l) =>
      finding(
        "DQ.LEDGER.NO_GSTIN",
        "medium",
        "Party ledger missing GSTIN",
        `Party ledger "${l.name}" (under ${l.parent}) has no GSTIN.`,
        [l.name, l.parent],
        "Add the party's GSTIN, or confirm it is a B2C/unregistered party and document it.",
      ),
    );
}

function checkNoPan(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter((l) => isPartyLedger(l.parent) && !l.panNumber)
    .map((l) =>
      finding(
        "DQ.LEDGER.NO_PAN",
        "low",
        "Party ledger missing PAN",
        `Party ledger "${l.name}" (under ${l.parent}) has no PAN.`,
        [l.name, l.parent],
        "Add PAN for TDS compliance, or confirm it is not required.",
      ),
    );
}

function checkWrongGroupCreditor(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter(
      (l) =>
        includesAny(l.name, CREDITOR_NAMES) &&
        !includesAny(l.parent, ["sundry creditor", "loans (liability)"]),
    )
    .map((l) =>
      finding(
        "DQ.LEDGER.WRONG_GROUP_CREDITOR",
        "medium",
        "Creditor-like ledger mis-grouped",
        `"${l.name}" looks like a creditor but sits under "${l.parent}".`,
        [l.name, l.parent],
        "Move the ledger under Sundry Creditors (or the right liability group).",
      ),
    );
}

function checkWrongGroupDebtor(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter(
      (l) =>
        includesAny(l.name, DEBTOR_NAMES) &&
        !includesAny(l.parent, ["sundry debtor", "loans & advances"]),
    )
    .map((l) =>
      finding(
        "DQ.LEDGER.WRONG_GROUP_DEBTOR",
        "medium",
        "Debtor-like ledger mis-grouped",
        `"${l.name}" looks like a debtor but sits under "${l.parent}".`,
        [l.name, l.parent],
        "Move the ledger under Sundry Debtors (or the right asset group).",
      ),
    );
}

function checkTaxLedgerWrongGroup(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter((l) => {
      const looksTaxy = includesAny(l.name, TAX_TOKENS);
      const inDutiesAndTaxes = norm(l.parent).startsWith("duties & taxes");
      return looksTaxy && !inDutiesAndTaxes;
    })
    .map((l) =>
      finding(
        "DQ.LEDGER.TAX_LEDGER_WRONG_GROUP",
        "high",
        "Tax ledger not under Duties & Taxes",
        `"${l.name}" appears to be a tax ledger but is grouped under "${l.parent}".`,
        [l.name, l.parent],
        "Move the ledger under Duties & Taxes so GST returns roll up correctly.",
      ),
    );
}

function checkExpenseUnderIncome(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter(
      (l) =>
        includesAny(l.name, EXPENSE_NAMES) &&
        INCOME_GROUPS.some((g) => norm(l.parent).includes(g)),
    )
    .map((l) =>
      finding(
        "DQ.LEDGER.EXPENSE_UNDER_INCOME",
        "high",
        "Expense ledger grouped under income",
        `"${l.name}" reads as an expense but sits under "${l.parent}".`,
        [l.name, l.parent],
        "Move it to Direct/Indirect Expenses or Purchase Accounts.",
      ),
    );
}

function checkIncomeUnderExpense(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter(
      (l) =>
        includesAny(l.name, INCOME_NAMES) &&
        EXPENSE_GROUPS.some((g) => norm(l.parent).includes(g)),
    )
    .map((l) =>
      finding(
        "DQ.LEDGER.INCOME_UNDER_EXPENSE",
        "high",
        "Income ledger grouped under expense",
        `"${l.name}" reads as income but sits under "${l.parent}".`,
        [l.name, l.parent],
        "Move it to Sales Accounts or Direct/Indirect Incomes.",
      ),
    );
}

// ─── Voucher checks ──────────────────────────────────────────────────────────

function isMaterial(amount: number, threshold: number): boolean {
  return Math.abs(amount) >= threshold;
}

function voucherGross(v: { entries: ReadonlyArray<{ amount: number }> }): number {
  // Half-sum of absolute amounts ≈ voucher value (debits = credits).
  return v.entries.reduce((a, e) => a + Math.abs(e.amount), 0) / 2;
}

function checkVoucherNoNarration(ctx: DataQualityContext): Finding[] {
  const threshold = ctx.materialityThreshold ?? DEFAULT_MATERIALITY;
  return ctx.vouchers
    .filter((v) => (!v.narration || !v.narration.trim()) && isMaterial(voucherGross(v), threshold))
    .map((v) =>
      finding(
        "DQ.VOUCHER.NO_NARRATION",
        "low",
        "Material voucher without narration",
        `${v.voucherType} ${v.voucherNumber ?? ""} on ${v.date} has no narration (₹${voucherGross(v).toFixed(2)}).`,
        [v.voucherType, v.voucherNumber ?? "", v.date],
        "Add a narration describing the business reason for the entry.",
      ),
    );
}

function checkDuplicateVoucherNumber(ctx: DataQualityContext): Finding[] {
  const seen = new Map<string, string[]>();
  for (const v of ctx.vouchers) {
    if (!v.voucherNumber) continue;
    const key = `${v.voucherType}::${v.voucherNumber}`;
    const list = seen.get(key) ?? [];
    list.push(`${v.date} (${v.party ?? "no party"})`);
    seen.set(key, list);
  }
  return [...seen.entries()]
    .filter(([, dates]) => dates.length > 1)
    .map(([key, dates]) => {
      const [type, num] = key.split("::");
      return finding(
        "DQ.VOUCHER.DUPLICATE_NUMBER",
        "high",
        "Duplicate voucher number",
        `${type} #${num} appears ${dates.length} times in this period.`,
        [type ?? "", num ?? "", ...dates],
        "Investigate and renumber the duplicates; numbering should be unique per type per FY.",
      );
    });
}

function checkMissingNarrationRatio(ctx: DataQualityContext): Finding[] {
  if (ctx.vouchers.length === 0) return [];
  const missing = ctx.vouchers.filter((v) => !v.narration || !v.narration.trim()).length;
  const ratio = missing / ctx.vouchers.length;
  if (ratio <= 0.2) return [];
  return [
    finding(
      "DQ.BOOKS.MISSING_NARRATION_RATIO",
      "medium",
      "Too many vouchers without narration",
      `${missing} of ${ctx.vouchers.length} vouchers (${(ratio * 100).toFixed(1)}%) have no narration.`,
      [`missing=${missing}`, `total=${ctx.vouchers.length}`],
      "Add narrations during entry; consider Tally template/voucher classes to enforce them.",
    ),
  ];
}

function checkRoundFigure(ctx: DataQualityContext): Finding[] {
  const threshold = ctx.materialityThreshold ?? DEFAULT_MATERIALITY;
  return ctx.vouchers
    .filter((v) => {
      if (v.voucherType !== "Journal") return false;
      const gross = voucherGross(v);
      return gross >= threshold && gross === Math.round(gross / 10000) * 10000;
    })
    .map((v) =>
      finding(
        "DQ.BOOKS.ROUND_FIGURE_ENTRIES",
        "medium",
        "Round-figure journal entry",
        `Journal ${v.voucherNumber ?? ""} on ${v.date} for ₹${voucherGross(v).toFixed(2)} is a perfect multiple of 10,000.`,
        [v.voucherType, v.voucherNumber ?? "", v.date],
        "Confirm the underlying calculation; round figures are a soft red flag for estimates.",
      ),
    );
}

function checkLargeManualJournal(ctx: DataQualityContext): Finding[] {
  const threshold = (ctx.materialityThreshold ?? DEFAULT_MATERIALITY) * 10;
  return ctx.vouchers
    .filter((v) => v.voucherType === "Journal" && voucherGross(v) >= threshold)
    .map((v) =>
      finding(
        "DQ.BOOKS.LARGE_MANUAL_JOURNAL",
        "high",
        "Large manual journal entry",
        `Journal ${v.voucherNumber ?? ""} on ${v.date} is ₹${voucherGross(v).toFixed(2)} (≥ ₹${threshold.toLocaleString("en-IN")}).`,
        [v.voucherType, v.voucherNumber ?? "", v.date],
        "Document the business reason; large manual journals need supporting evidence.",
      ),
    );
}

function checkBackdated(ctx: DataQualityContext): Finding[] {
  return ctx.vouchers
    .filter((v) => v.date < ctx.period.from)
    .map((v) =>
      finding(
        "DQ.BOOKS.BACKDATED_ENTRIES",
        "high",
        "Entry dated before period start",
        `${v.voucherType} ${v.voucherNumber ?? ""} dated ${v.date} is earlier than the period start ${ctx.period.from}.`,
        [v.voucherType, v.voucherNumber ?? "", v.date],
        "Investigate; backdated entries are an audit-trail concern.",
      ),
    );
}

// ─── Balance checks ──────────────────────────────────────────────────────────

function checkCashNegative(ctx: DataQualityContext): Finding[] {
  const cashRows = ctx.trialBalance.filter((r) =>
    norm(r.groupName).includes("cash-in-hand"),
  );
  return cashRows
    .filter((r) => r.credit > r.debit)
    .map((r) =>
      finding(
        "DQ.CASH.NEGATIVE",
        "high",
        "Negative cash balance",
        `${r.ledgerName ?? r.groupName} closes credit ₹${r.credit.toFixed(2)} > debit ₹${r.debit.toFixed(2)}.`,
        [r.groupName, r.ledgerName ?? ""],
        "Trace receipts and payments; cash cannot be negative in reality.",
      ),
    );
}

function checkSuspenseHasBalance(ctx: DataQualityContext): Finding[] {
  return ctx.trialBalance
    .filter((r) => norm(r.groupName).includes("suspense") && (r.debit !== 0 || r.credit !== 0))
    .map((r) =>
      finding(
        "DQ.SUSPENSE.HAS_BALANCE",
        "high",
        "Suspense ledger has balance",
        `${r.ledgerName ?? r.groupName} ends the period with Dr ₹${r.debit.toFixed(2)} / Cr ₹${r.credit.toFixed(2)}.`,
        [r.groupName, r.ledgerName ?? ""],
        "Suspense should clear before period close; identify and re-classify the entries.",
      ),
    );
}

// ─── GST format check ────────────────────────────────────────────────────────

function checkGstinFormat(ctx: DataQualityContext): Finding[] {
  return ctx.ledgers
    .filter((l) => l.gstin && !GSTIN_RE.test(l.gstin))
    .map((l) =>
      finding(
        "DQ.GST.GSTIN_FORMAT_INVALID",
        "high",
        "Invalid GSTIN format",
        `Ledger "${l.name}" has GSTIN "${l.gstin}" which doesn't match the 15-char format.`,
        [l.name, l.gstin!],
        "Correct the GSTIN; the portal expects 2 state + 10 PAN + entity + Z + checksum.",
      ),
    );
}

export const AUDIT_LITE_CHECKS = [
  checkDuplicateLedgers,
  checkDuplicateGstin,
  checkNoGstin,
  checkNoPan,
  checkWrongGroupCreditor,
  checkWrongGroupDebtor,
  checkTaxLedgerWrongGroup,
  checkExpenseUnderIncome,
  checkIncomeUnderExpense,
  checkVoucherNoNarration,
  checkDuplicateVoucherNumber,
  checkMissingNarrationRatio,
  checkRoundFigure,
  checkLargeManualJournal,
  checkBackdated,
  checkCashNegative,
  checkSuspenseHasBalance,
  checkGstinFormat,
] as const satisfies ReadonlyArray<(ctx: DataQualityContext) => Finding[]>;

export const AUDIT_LITE_CHECK_COUNT = AUDIT_LITE_CHECKS.length;
