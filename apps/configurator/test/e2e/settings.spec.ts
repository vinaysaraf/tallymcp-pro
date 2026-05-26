import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "../..");

test("Settings screen shows install dir, version, and Restore button", async () => {
  const app = await electron.launch({
    args: [join(APP_ROOT, "dist/main/index.js")],
    cwd: APP_ROOT,
  });
  const window = await app.firstWindow();
  await expect(window.locator("text=TallyMCP Configurator")).toBeVisible({ timeout: 10_000 });

  await window.locator("text=Settings").click();
  await expect(window.locator("text=TallyMCP install")).toBeVisible({ timeout: 5_000 });
  await expect(window.locator("text=Version")).toBeVisible();
  await expect(window.getByRole("button", { name: /Restore Tally settings/i })).toBeVisible();

  await app.close();
});
