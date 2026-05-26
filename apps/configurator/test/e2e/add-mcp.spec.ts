import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "../..");

test("Clicking 'Add MCP' on a tile opens the modal with info box + trust block", async () => {
  const app = await electron.launch({
    args: [join(APP_ROOT, "dist/main/index.js")],
    cwd: APP_ROOT,
  });
  const window = await app.firstWindow();
  await expect(window.locator("text=TallyMCP Configurator")).toBeVisible({ timeout: 10_000 });

  // First "Add MCP" button is on Claude Desktop tile (or Cursor — depends on whether
  // anything is already configured). Grab the first one and click it.
  const firstAdd = window.locator("button", { hasText: "+ Add MCP" }).first();
  if (await firstAdd.isVisible()) {
    await firstAdd.click();
    await expect(window.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(window.locator("text=/I will do exactly 3 things/i")).toBeVisible();
    await expect(window.locator("text=/What WILL NOT happen/i")).toBeVisible();

    await window.getByRole("button", { name: "Cancel" }).click();
    await expect(window.getByRole("dialog")).not.toBeVisible();
  }

  await app.close();
});
