import { describe, it, expect } from "vitest";
import { resolveInstallDir } from "../../src/main/install-dir.js";

describe("resolveInstallDir", () => {
  it("returns the dir containing the exe in packaged (production) builds", () => {
    // Real packaged exe is TallyMCP.exe (electron-builder.yml productName).
    const result = resolveInstallDir({
      isPackaged: true,
      exePath: "C:\\Users\\me\\AppData\\Local\\Programs\\TallyMCP\\TallyMCP.exe",
      env: {},
      homedirPath: "C:\\Users\\me",
    });
    expect(result).toBe("C:\\Users\\me\\AppData\\Local\\Programs\\TallyMCP");
  });

  it("returns %LOCALAPPDATA%\\Programs\\TallyMCP in dev when LOCALAPPDATA is set", () => {
    const result = resolveInstallDir({
      isPackaged: false,
      exePath: "C:\\Users\\me\\node_modules\\electron\\dist\\electron.exe",
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      homedirPath: "C:\\Users\\me",
    });
    expect(result).toBe("C:\\Users\\me\\AppData\\Local\\Programs\\TallyMCP");
  });

  it("falls back to homedir\\AppData\\Local\\Programs\\TallyMCP in dev when LOCALAPPDATA missing", () => {
    const result = resolveInstallDir({
      isPackaged: false,
      exePath: "C:\\Users\\me\\node_modules\\electron\\dist\\electron.exe",
      env: {},
      homedirPath: "C:\\Users\\me",
    });
    expect(result).toBe("C:\\Users\\me\\AppData\\Local\\Programs\\TallyMCP");
  });
});
