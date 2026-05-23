export { TallyHttpError } from "./errors.js";
export { TallyHttpClient, type TallyHttpClientOptions } from "./http-client.js";
export { RequestSerializer } from "./serializer.js";
export {
  DiagnosticCodeSchema,
  DiagnosticFailSchema,
  DiagnosticOkSchema,
  DiagnosticResultSchema,
  DIAGNOSTIC_HINTS,
  type DiagnosticCode,
  type DiagnosticResult,
} from "./diagnostic.js";
export {
  analyzeDiagnoseResponse,
  diagnoseTally,
  mapDiagnoseError,
  type DiagnoseTallyOptions,
} from "./diagnose.js";
export {
  getListCompaniesEnvelope,
  LIST_COMPANIES_ENVELOPE,
} from "./list-companies-envelope.js";
