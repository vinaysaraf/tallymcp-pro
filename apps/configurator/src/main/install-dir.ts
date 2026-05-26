// `node:path/win32` always uses backslash semantics regardless of host OS.
// This helper is semantically about Windows install paths (TallyMCP ships
// as a Windows-only NSIS .exe), so forcing win32 keeps unit tests passing
// on Linux CI where `node:path` defaults to POSIX (forward slashes) and
// would produce mixed-separator output like `C:\Users\me\AppData\Local/Programs/TallyMCP`.
import { dirname, join } from "node:path/win32";

/**
 * Inputs for {@link resolveInstallDir}. Modeled so the function is pure
 * (no Electron / fs / process side effects) and trivially unit-testable.
 *
 * - `isPackaged` — Electron's `app.isPackaged`. True when the app was
 *   launched from an NSIS-installed `.exe`; false during `pnpm dev` or
 *   when launched via `electron .` against the build output.
 * - `exePath` — Electron's `app.getPath("exe")`. In a packaged build this
 *   is `<installDir>\TallyMCP.exe`; in dev it's the system
 *   Electron binary inside `node_modules/electron/dist/`.
 * - `env` — usually `process.env`. Only `LOCALAPPDATA` is read.
 * - `homedirPath` — usually `os.homedir()`. Last-resort fallback.
 */
export interface ResolveInstallDirInput {
  isPackaged: boolean;
  exePath: string;
  env: Record<string, string | undefined>;
  homedirPath: string;
}

/**
 * Returns the absolute path where TallyMCP is (or will be) installed.
 *
 * Production (`isPackaged: true`): the parent dir of the running .exe.
 * Dev (`isPackaged: false`): `%LOCALAPPDATA%\Programs\TallyMCP` if
 * available, else `homedir/AppData/Local/Programs/TallyMCP`. The dev path
 * matches electron-builder's user-mode default so wire snippets generated
 * in dev work after the user runs the real installer.
 */
export function resolveInstallDir(input: ResolveInstallDirInput): string {
  if (input.isPackaged) {
    return dirname(input.exePath);
  }
  const localAppData =
    input.env.LOCALAPPDATA ?? join(input.homedirPath, "AppData", "Local");
  return join(localAppData, "Programs", "TallyMCP");
}
