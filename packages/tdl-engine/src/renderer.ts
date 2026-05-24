import nunjucks from "nunjucks";

/**
 * Nunjucks environment configured with custom block/variable tags so the
 * resulting template files are also valid XML (an inert `<nunjuck>...</nunjuck>`
 * element when viewed as raw XML).
 *
 * Variable tags `{{ ... }}` are kept as-is — they are the standard nunjucks
 * interpolation token. The user-facing convention is to always pipe through
 * `| escape` for company names and other user-supplied strings.
 */
const env = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: false,
  tags: {
    blockStart: "<nunjuck>",
    blockEnd: "</nunjuck>",
    variableStart: "{{",
    variableEnd: "}}",
    commentStart: "<comment>begin</comment>",
    commentEnd: "<comment>end</comment>",
  },
});

/**
 * Renders a TDL template through nunjucks only. Angular-bracket parameter
 * substitution (`{fromDate}` → `1-Apr-2022`) runs in a separate later stage
 * — see {@link substituteTdlParameters}.
 */
export function renderNunjucks(xml: string, vars: Record<string, unknown>): string {
  return env.renderString(xml, vars);
}

/**
 * Replaces `{name}` placeholders in the rendered XML with typed parameter
 * values. Runs AFTER {@link renderNunjucks} so nunjucks output never sees raw
 * angular-bracket tokens.
 *
 * Coercion rules:
 *  - string  → HTML-escaped
 *  - number  → `String(n)`
 *  - boolean → `"Yes"` or `"No"`
 *  - Date    → `d-MMM-yyyy` (Tally's display format)
 *  - missing parameter → leave `{name}` token in place (caller's problem)
 */
export function substituteTdlParameters(
  xml: string,
  params: Record<string, unknown>,
): string {
  let result = xml;
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const pattern = new RegExp(`\\{${escapeRegExp(name)}\\}`, "g");
    result = result.replace(pattern, () => coerce(value));
  }
  return result;
}

function coerce(value: unknown): string {
  if (typeof value === "string") return escapeHtml(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return formatTallyDisplayDate(value);
  return escapeHtml(String(value));
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatTallyDisplayDate(d: Date): string {
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
