import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "../..");

test("Health Check screen renders and lists Tally detection result", async () => {
  const app = await electron.launch({
    args: [join(APP_ROOT, "dist/main/index.js")],
    cwd: APP_ROOT,
  });

  const window = await app.firstWindow();
  await expect(window.locator("text=TallyMCP Configurator")).toBeVisible({ timeout: 10_000 });

  await window.locator("text=Health Check").click();
  // Either green TallyPrime found OR red Install TallyPrime
  await expect(
    window.locator("text=/TallyPrime found|Install TallyPrime/"),
  ).toBeVisible({ timeout: 5_000 });

  await app.close();
});
