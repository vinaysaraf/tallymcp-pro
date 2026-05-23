const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXmlText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

export function escapeXmlAttr(s: string): string {
  return escapeXmlText(s);
}

export function escapeForTally(s: string): string {
  return escapeXmlText(s.trim());
}
