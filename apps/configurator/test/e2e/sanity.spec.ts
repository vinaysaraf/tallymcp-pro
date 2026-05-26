import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "../..");

test("Electron app boots and renders the home screen", async () => {
  const app = await electron.launch({
    args: [join(APP_ROOT, "dist/main/index.js")],
    cwd: APP_ROOT,
  });

  const window = await app.firstWindow();
  await expect(window.locator("text=TallyMCP Configurator")).toBeVisible({ timeout: 10_000 });
  // The 5 tile labels render.
  await expect(window.locator("text=Claude Desktop")).toBeVisible();
  await expect(window.locator("text=Cursor")).toBeVisible();

  await app.close();
});
