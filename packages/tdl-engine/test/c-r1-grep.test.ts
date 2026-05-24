import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * C-R1 enforcement: TDL templates may not request anything that mutates
 * Tally state. This test fails loudly if a template ever contains write
 * verbs — a tripwire against accidental scope expansion past read-only.
 */

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "Import Data request", regex: /TALLYREQUEST\s*>\s*Import/i },
  { name: 'ACTION="Alter"', regex: /ACTION\s*=\s*"Alter"/i },
  { name: 'ACTION="Create"', regex: /ACTION\s*=\s*"Create"/i },
  { name: 'ACTION="Delete"', regex: /ACTION\s*=\s*"Delete"/i },
  { name: 'TAGNAME="MASTER ID" (alter-voucher tripwire)', regex: /TAGNAME\s*=\s*"MASTER\s+ID"/i },
];

describe("C-R1 enforcement on TDL templates", () => {
  const templateFiles = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".xml"));

  it("templates/ directory contains ≥1 .xml template", () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  for (const file of templateFiles) {
    it(`${file} contains no write/alter/create/delete/MASTER ID directives`, () => {
      const content = readFileSync(join(TEMPLATES_DIR, file), "utf8");
      const offenders = FORBIDDEN_PATTERNS.filter((p) => p.regex.test(content));
      expect(
        offenders.map((o) => o.name),
        `Template ${file} contains forbidden directive(s)`,
      ).toEqual([]);
    });
  }
});
