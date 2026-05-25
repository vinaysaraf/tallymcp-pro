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
 * Used by `gateOnVouchers` in the MCP server: when `voucherQueriesViable` is
 * false the voucher / closing-balance / audit-lite tools fail fast with a
 * clear pointer to the file-import path, instead of hanging Tally for minutes.
 */
export interface TallyCapabilities {
  reachable: boolean;
  edition: "silver" | "gold" | "unknown";
  voucherQueriesViable: boolean;
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
          voucherQueriesViable: false,
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
        voucherQueriesViable: false,
        detectedAt,
        message: `Could not reach Tally (list-companies failed): ${(err as Error).message}. Make sure TallyPrime is running with XML/HTTP enabled on the configured port.`,
      };
    }
  }
  if (!company) {
    return {
      reachable: true,
      edition: "unknown",
      voucherQueriesViable: false,
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
        voucherQueriesViable: true,
        detectedAt,
        message:
          "TallyPrime 4.x / Gold detected. Voucher, balance, audit-lite, and dashboard tools are enabled.",
      };
    }
    return {
      reachable: true,
      edition: "silver",
      voucherQueriesViable: false,
      detectedAt,
      message:
        "TallyPrime Silver (or older) detected — XML voucher and computed-balance queries are not viable here. Masters and connection tools work fine; for vouchers, export from Tally UI (Display → Day Book → E: Export → XML) and use tally_import_vouchers_from_file. To override (e.g., on a small dataset), set config tally.unsafeSlow=true.",
    };
  } catch (err) {
    return {
      reachable: true,
      edition: "unknown",
      voucherQueriesViable: false,
      detectedAt,
      message: `Edition probe timed out (${(err as Error).message}). Treating as Silver-class for safety. To override, set config tally.unsafeSlow=true.`,
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
    voucherQueriesViable: assumed === "gold",
    detectedAt: new Date().toISOString(),
    message: `Edition forced via ${reason}.`,
  };
}
