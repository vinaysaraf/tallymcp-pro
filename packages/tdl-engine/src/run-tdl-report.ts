import type { CatalogReport } from "./catalog.js";
import { TdlEngineError, TdlExceptionError } from "./errors.js";
import { parseRows } from "./parser.js";
import { renderNunjucks, substituteTdlParameters } from "./renderer.js";

/** Minimal client interface implemented by `TallyHttpClient` and test stubs. */
export interface TdlHttpClient {
  post(xml: string, options?: { charset?: "utf-16" | "utf-8" }): Promise<string>;
}

export type TdlParams = Record<string, string | number | boolean | Date | undefined>;

/**
 * Renders a TDL template with the supplied params, POSTs it to Tally over the
 * supplied client, and parses the `<ROW>` response into typed objects per the
 * report's catalog schema.
 *
 * The TDL transport always asks Tally for UTF-16 LE (the v0.7 default) by
 * passing `charset: "utf-16"` to the client.
 */
export async function runTdlReport<T = Record<string, unknown>>(
  client: TdlHttpClient,
  report: CatalogReport,
  template: string,
  params: TdlParams,
): Promise<T[]> {
  validateParams(report, params);

  const nunjucksOut = renderNunjucks(template, params as Record<string, unknown>);
  const requestXml = substituteTdlParameters(nunjucksOut, params as Record<string, unknown>);

  const responseXml = await client.post(requestXml, { charset: "utf-16" });

  const trimmed = responseXml.trim();
  if (trimmed.startsWith("<EXCEPTION>")) {
    const match = trimmed.match(/<EXCEPTION>([\s\S]*?)<\/EXCEPTION>/);
    throw new TdlExceptionError(match?.[1]?.trim() ?? "Unknown Tally exception");
  }

  return parseRows<T>(responseXml, report.output.fields, report.name);
}

function validateParams(report: CatalogReport, params: TdlParams): void {
  for (const input of report.input) {
    if (input.required && params[input.name] === undefined) {
      throw new TdlEngineError(
        `Report "${report.name}" requires input parameter "${input.name}" (${input.datatype})`,
      );
    }
  }
}
