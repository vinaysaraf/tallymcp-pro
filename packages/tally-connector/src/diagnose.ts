import {
  DIAGNOSTIC_HINTS,
  type DiagnosticCode,
  type DiagnosticResult,
} from "./diagnostic.js";
import {
  connectionErrorMessage,
  isConnectionRefused,
  isTimeoutError,
} from "./connection-error.js";
import { TallyHttpError } from "./errors.js";
import type { TallyHttpClient } from "./http-client.js";
import { getListCompaniesEnvelope } from "./list-companies-envelope.js";

export interface DiagnoseTallyOptions {
  envelope?: string;
}

function extractLineError(body: string): string | undefined {
  const match = body.match(/<LINEERROR[^>]*>([^<]*)<\/LINEERROR>/i);
  return match?.[1]?.trim() || undefined;
}

function countCompanies(body: string): number {
  // Tally varies the element name across editions:
  //   TallyPrime 4.x:   <COMPANY NAME="...">
  //   TallyPrime Silver / older: <COMPANYNAME>...</COMPANYNAME> under <CMPINFO>
  // Prefer the rich <COMPANY> count when present; fall back to the bare
  // <COMPANYNAME> count so older editions still register as "loaded".
  const richMatches = body.match(/<COMPANY[\s>]/gi);
  if (richMatches && richMatches.length > 0) return richMatches.length;
  const nameMatches = body.match(/<COMPANYNAME[\s>]/gi);
  return nameMatches?.length ?? 0;
}

function previewBody(body: string, maxChars = 400): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}…` : collapsed;
}

function extractTallyVersion(body: string): string | undefined {
  const remote = body.match(/<REMOTECMPVERSION[^>]*>([^<]*)<\/REMOTECMPVERSION>/i);
  if (remote?.[1]?.trim()) return remote[1].trim();
  const product = body.match(/<PRODUCTVERSION[^>]*>([^<]*)<\/PRODUCTVERSION>/i);
  if (product?.[1]?.trim()) return product[1].trim();
  return undefined;
}

export function analyzeDiagnoseResponse(body: string): DiagnosticResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return fail("XML_INTERFACE_OFF", "Tally returned an empty response.");
  }

  const lineError = extractLineError(body);
  if (lineError) {
    return fail("UNEXPECTED_RESPONSE", lineError);
  }

  const companiesLoaded = countCompanies(body);
  if (companiesLoaded === 0) {
    return fail(
      "NO_COMPANY_LOADED",
      "Tally responded but no companies were found in the export.",
      `Tally responded but no <COMPANY> or <COMPANYNAME> elements were found. Body preview: ${previewBody(body)}`,
    );
  }

  return {
    ok: true,
    companiesLoaded,
    tallyVersion: extractTallyVersion(body),
  };
}

function fail(
  code: DiagnosticCode,
  message: string,
  detailMessage?: string,
): DiagnosticResult {
  return {
    ok: false,
    code,
    message: detailMessage ?? message,
    hint: DIAGNOSTIC_HINTS[code],
  };
}

export function mapDiagnoseError(
  err: unknown,
  client: TallyHttpClient,
): DiagnosticResult {
  if (isConnectionRefused(err)) {
    return fail(
      "PORT_REFUSED",
      `Cannot connect to Tally at ${client.host}:${client.port}.`,
      connectionErrorMessage(err),
    );
  }

  if (isTimeoutError(err)) {
    return fail(
      "TALLY_NOT_REACHABLE",
      `Tally at ${client.host}:${client.port} did not respond in time.`,
      connectionErrorMessage(err),
    );
  }

  if (err instanceof TallyHttpError) {
    const status = err.meta.statusCode;
    return fail(
      "UNEXPECTED_RESPONSE",
      err.message,
      typeof status === "number"
        ? `HTTP ${status} from Tally at ${client.host}:${client.port}.`
        : err.message,
    );
  }

  return fail(
    "TALLY_NOT_REACHABLE",
    `Could not reach Tally at ${client.host}:${client.port}.`,
    connectionErrorMessage(err),
  );
}

export async function diagnoseTally(
  client: TallyHttpClient,
  options?: DiagnoseTallyOptions,
): Promise<DiagnosticResult> {
  const envelope = options?.envelope ?? getListCompaniesEnvelope();
  try {
    const body = await client.post(envelope);
    return analyzeDiagnoseResponse(body);
  } catch (err) {
    return mapDiagnoseError(err, client);
  }
}
