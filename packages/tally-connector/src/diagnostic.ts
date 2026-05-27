import { z } from "zod";

export const DiagnosticCodeSchema = z.enum([
  "TALLY_NOT_REACHABLE",
  "PORT_REFUSED",
  "XML_INTERFACE_OFF",
  "NO_COMPANY_LOADED",
  "UNEXPECTED_RESPONSE",
  "REQUEST_TIMEOUT",
]);

export type DiagnosticCode = z.infer<typeof DiagnosticCodeSchema>;

export const DiagnosticOkSchema = z.object({
  ok: z.literal(true),
  tallyVersion: z.string().optional(),
  companiesLoaded: z.number().int().nonnegative(),
});

export const DiagnosticFailSchema = z.object({
  ok: z.literal(false),
  code: DiagnosticCodeSchema,
  message: z.string(),
  hint: z.string(),
});

export const DiagnosticResultSchema = z.discriminatedUnion("ok", [
  DiagnosticOkSchema,
  DiagnosticFailSchema,
]);

export type DiagnosticResult = z.infer<typeof DiagnosticResultSchema>;

export const DIAGNOSTIC_HINTS: Record<DiagnosticCode, string> = {
  PORT_REFUSED:
    "Tally is running but the XML port is not listening. In Tally: F1 → Settings → Connectivity → Both, port 9000.",
  TALLY_NOT_REACHABLE:
    "Tally did not respond. Make sure TallyPrime is open and the company is loaded.",
  XML_INTERFACE_OFF:
    "Tally is reachable but the XML interface seems disabled.",
  NO_COMPANY_LOADED: "Open a company in TallyPrime (Gateway → select company).",
  UNEXPECTED_RESPONSE:
    "Tally returned an error in the XML response. Check the message and fix the request or Tally state.",
  REQUEST_TIMEOUT:
    "Tally did not respond within the timeout period. If using a networked Tally setup (Tally Gateway Server in tally.ini), verify the gateway host is reachable. Raise the timeout via TALLYMCP_TIMEOUT env var or config.tally.requestTimeoutMs.",
};
