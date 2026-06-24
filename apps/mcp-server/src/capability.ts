import { listCompanies, type TallyClient } from "@tallymcp/report-engine";

/**
 * What this Tally instance can actually serve via the XML interface.
 *
 * Detected once at MCP-server boot using two safe probes:
 *   1. `tally_list_companies` (Collection+TDL of Company — fast on every edition).
 *   2. A legacy `Trial Balance` Report request — TallyPrime Silver answers
 *      `STATUS=0` with an empty `<DATA/>` in under a second, while Gold / 4.x
 *      returns the actual report. Either way it returns fast and does **not**
 *      ask Tally to scan vouchers, so it cannot lock the instance the way a
 *      Voucher collection does.
 *
 * Two INDEPENDENT capability flags, because the data paths differ:
 *   - `reportFormViable` — the period-scoped report-form TDL works (Trial
 *     Balance, P&L, Balance Sheet, Day Book, Sales Register → and therefore
 *     `tally_export_vouchers`, `tally_run_audit_lite`, `tally_export_dashboard`).
 *     This works on EVERY reachable edition with a company loaded, including
 *     Silver — the Day Book TDL uses `<BELONGSTO>Yes</BELONGSTO>` so it honors
 *     the requested period and does not depend on `$ClosingBalance`.
 *   - `computedBalancesViable` — per-ledger / per-group `$ClosingBalance`
 *     evaluation is fast enough (`tally_get_ledger_closing_balance`,
 *     `tally_get_group_closing_balances`). This is the genuinely slow path on
 *     Silver, so it stays gated there.
 *
 * `gateOnReportForm` / `gateOnComputedBalances` in the MCP server use these.
 */
export interface TallyCapabilities {
  reachable: boolean;
  edition: "silver" | "gold" | "unknown";
  /** Period-scoped report-form TDL works (Day Book / vouchers / audit / dashboards). */
  reportFormViable: boolean;
  /** Per-ledger/-group `$ClosingBalance` evaluation is viable (slow on Silver). */
  computedBalancesViable: boolean;
  detectedAt: string;
  /** Human-readable explanation surfaced through `tally_get_capabilities`. */
  message: string;
}

const LEGACY_TB_PROBE = (company: string): string => `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE><ID>Trial Balance</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVCURRENTCOMPANY>${company.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
  </STATICVARIABLES></DESC></BODY>
</ENVELOPE>`;

async function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timed out after ${ms} ms`)), ms),
    ),
  ]);
}

export interface ProbeOptions {
  timeoutMs?: number;
  /** Pre-known company; if omitted the probe lists companies first and picks one. */
  company?: string;
}

export async function probeTallyCapabilities(
  client: TallyClient,
  options: ProbeOptions = {},
): Promise<TallyCapabilities> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const detectedAt = new Date().toISOString();

  let company = options.company;
  if (!company) {
    try {
      const companies = await withDeadline(listCompanies(client), timeoutMs, "list-companies");
      if (companies.length === 0) {
        return {
          reachable: true,
          edition: "unknown",
          reportFormViable: false,
          computedBalancesViable: false,
          detectedAt,
          message:
            "Tally is reachable but no companies are loaded. Open a company in TallyPrime and call tally_test_connection again.",
        };
      }
      company = companies[0]?.name;
    } catch (err) {
      return {
        reachable: false,
        edition: "unknown",
        reportFormViable: false,
        computedBalancesViable: false,
        detectedAt,
        message: `Could not reach Tally (list-companies failed): ${(err as Error).message}. Make sure TallyPrime is running with XML/HTTP enabled on the configured port.`,
      };
    }
  }
  if (!company) {
    return {
      reachable: true,
      edition: "unknown",
      reportFormViable: false,
      computedBalancesViable: false,
      detectedAt,
      message: "No company name available for the edition probe.",
    };
  }

  try {
    const body = await withDeadline(
      client.post(LEGACY_TB_PROBE(company)),
      timeoutMs,
      "tb-probe",
    );
    const goldLike =
      /<STATUS>\s*1\s*<\/STATUS>/.test(body) && /<TBROW|<DSPACCNAME|<LEDGER /i.test(body);
    if (goldLike) {
      return {
        reachable: true,
        edition: "gold",
        reportFormViable: true,
        computedBalancesViable: true,
        detectedAt,
        message:
          "TallyPrime 4.x / Gold detected. All tools enabled (reports, vouchers, audit-lite, dashboards, and per-ledger closing balances).",
      };
    }
    return {
      reachable: true,
      edition: "silver",
      reportFormViable: true,
      computedBalancesViable: false,
      detectedAt,
      message:
        "TallyPrime Silver (or older) detected. Reports, Day Book / voucher export, audit-lite, and dashboards work here (period-scoped report-form). Only the per-ledger / per-group closing-balance tools are disabled — `$ClosingBalance` evaluation is slow on this edition; use TallyPrime 4.x for those, or set config tally.unsafeSlow=true to attempt them anyway.",
    };
  } catch (err) {
    // The list-companies probe already succeeded (we have a company), so Tally is
    // reachable and the report-form path is viable; only the legacy TB probe timed
    // out. Treat computed balances as not-viable for safety.
    return {
      reachable: true,
      edition: "unknown",
      reportFormViable: true,
      computedBalancesViable: false,
      detectedAt,
      message: `Edition probe timed out (${(err as Error).message}); report-form tools (reports/vouchers/audit/dashboards) remain available. Treating per-ledger closing-balance tools as Silver-class for safety — set config tally.unsafeSlow=true to attempt them.`,
    };
  }
}

export function fromAssumedEdition(
  assumed: "silver" | "gold",
  reason = "config.tally.assumedEdition",
): TallyCapabilities {
  return {
    reachable: true,
    edition: assumed,
    // Report-form TDL works on both editions; only computed balances differ.
    reportFormViable: true,
    computedBalancesViable: assumed === "gold",
    detectedAt: new Date().toISOString(),
    message: `Edition forced via ${reason}.`,
  };
}
