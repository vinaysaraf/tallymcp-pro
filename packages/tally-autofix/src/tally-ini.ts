/**
 * tally.ini is "INI-shaped" but not strictly RFC-INI. We preserve:
 *  - The original line order (so diffs are minimal)
 *  - Comments (lines starting with ;;) and blank lines
 *  - Section markers like [TALLY]
 *  - Existing key casing
 * We treat key lookups as case-insensitive (Tally writes them inconsistently).
 */

interface TallyIniLine {
  kind: "kv" | "raw";
  key?: string;
  value?: string;
  /** Original line text (used for kind="raw" — comments, blanks, section headers). */
  raw: string;
}

export class TallyIni {
  // Insertion-order array of lines; key→index map for fast lookup.
  private constructor(
    private readonly lines: TallyIniLine[],
    private readonly keyIndex: Map<string, number>,
  ) {}

  static fromText(text: string): TallyIni {
    const lines: TallyIniLine[] = [];
    const keyIndex = new Map<string, number>();
    for (const raw of text.split(/\r?\n/)) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("[")) {
        lines.push({ kind: "raw", raw });
        continue;
      }
      const eq = raw.indexOf("=");
      if (eq < 0) {
        lines.push({ kind: "raw", raw });
        continue;
      }
      const key = raw.slice(0, eq).trim();
      const value = raw.slice(eq + 1).trim();
      keyIndex.set(key.toLowerCase(), lines.length);
      lines.push({ kind: "kv", key, value, raw });
    }
    return new TallyIni(lines, keyIndex);
  }

  get(key: string): string | undefined {
    const idx = this.keyIndex.get(key.toLowerCase());
    if (idx === undefined) return undefined;
    return this.lines[idx].value;
  }

  /** Returns a NEW TallyIni with `key=value` set (added or updated). */
  set(key: string, value: string): TallyIni {
    const idx = this.keyIndex.get(key.toLowerCase());
    const newLines = this.lines.slice();
    const newKeyIndex = new Map(this.keyIndex);
    if (idx !== undefined) {
      newLines[idx] = { kind: "kv", key, value, raw: `${key}=${value}` };
    } else {
      newKeyIndex.set(key.toLowerCase(), newLines.length);
      newLines.push({ kind: "kv", key, value, raw: `${key}=${value}` });
    }
    return new TallyIni(newLines, newKeyIndex);
  }

  serialize(): string {
    return this.lines.map((l) => l.raw).join("\n");
  }
}

export function parseTallyIni(text: string): TallyIni {
  return TallyIni.fromText(text);
}

export function serializeTallyIni(ini: TallyIni): string {
  return ini.serialize();
}

/**
 * Returns a new TallyIni with the two XML-interface lines guaranteed:
 *   Client Server=Both
 *   ServerPort=9000
 * If `Client Server` is currently `Server`, we upgrade it to `Both`.
 */
export function ensureXmlInterfaceLines(ini: TallyIni): TallyIni {
  return ini.set("Client Server", "Both").set("ServerPort", "9000");
}
