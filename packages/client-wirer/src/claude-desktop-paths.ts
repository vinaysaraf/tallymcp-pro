import { sep } from "node:path";

export type ClaudeDesktopVariant = "standard" | "msix";

export interface ClaudeDesktopConfigPath {
  path: string;
  variant: ClaudeDesktopVariant;
}

/**
 * Minimal `fs`-like interface used by the resolver. Production code passes
 * `node:fs` directly; tests pass a `FakeFs` so they remain platform-agnostic.
 */
export interface PathProbeFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
}

/**
 * Returns every applicable Claude Desktop config-file path for the supplied
 * environment. Claude Desktop ships in two flavors on Windows:
 *
 *  1. **Standard** — the standalone `.exe` from claude.ai/download. Reads
 *     its config from `%APPDATA%\Claude\claude_desktop_config.json`.
 *  2. **MSIX / Store** — the Microsoft Store package. AppContainer-sandboxed
 *     under `%LOCALAPPDATA%\Packages\Claude_<hash>\LocalCache\Roaming\Claude\`.
 *
 * If a user has both installed (real and possible), we write to BOTH so each
 * Claude Desktop process picks up TallyMCP. If neither directory exists yet,
 * we still return the standard path so first-run wire-ups land somewhere
 * predictable (`ClientWirer.add` creates the parent dir).
 *
 * @throws if `env.APPDATA` is missing — that's the minimum requirement.
 */
export function resolveClaudeDesktopConfigPaths(
  env: Record<string, string | undefined>,
  fs: PathProbeFs,
): ClaudeDesktopConfigPath[] {
  const appData = env.APPDATA;
  if (!appData) throw new Error("Required env var APPDATA is not set");
  const localAppData = env.LOCALAPPDATA;

  const out: ClaudeDesktopConfigPath[] = [];

  // Standard
  const standardDir = [appData, "Claude"].join(sep).replace(/\\/g, sep);
  const standardPath = [standardDir, "claude_desktop_config.json"].join(sep);
  const standardExists = fs.existsSync(standardDir);

  if (standardExists) {
    out.push({ path: standardPath, variant: "standard" });
  }

  // MSIX — scan %LOCALAPPDATA%\Packages\ for entries matching Claude_*
  if (localAppData) {
    const packagesDir = [localAppData, "Packages"].join(sep).replace(/\\/g, sep);
    if (fs.existsSync(packagesDir)) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(packagesDir);
      } catch {
        entries = [];
      }
      for (const name of entries) {
        if (!name.startsWith("Claude_")) continue;
        const sandboxDir = [
          packagesDir,
          name,
          "LocalCache",
          "Roaming",
          "Claude",
        ].join(sep);
        if (fs.existsSync(sandboxDir)) {
          out.push({
            path: [sandboxDir, "claude_desktop_config.json"].join(sep),
            variant: "msix",
          });
        }
      }
    }
  }

  // Neither exists — fall back to standard so first-run still writes somewhere.
  if (out.length === 0) {
    out.push({ path: standardPath, variant: "standard" });
  }

  return out;
}
