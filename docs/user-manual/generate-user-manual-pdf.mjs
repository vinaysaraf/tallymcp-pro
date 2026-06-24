import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function mdToBasicHtml(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  html.push("<!doctype html>");
  html.push("<html><head><meta charset=\"utf-8\"/>");
  html.push("<title>TallyMCP User Manual</title>");
  html.push(`<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:48px;line-height:1.45;color:#111}
h1{font-size:26px;margin:0 0 12px}
h2{font-size:18px;margin:22px 0 10px}
h3{font-size:15px;margin:18px 0 8px}
p{margin:8px 0}
code{font-family:Consolas,Menlo,monospace;font-size:12px;background:#f2f4f7;padding:2px 4px;border-radius:4px}
pre{background:#f2f4f7;padding:10px;border-radius:8px;overflow:auto}
hr{border:none;border-top:1px solid #e5e7eb;margin:18px 0}
ul{margin:6px 0 6px 22px}
li{margin:4px 0}
.muted{color:#444}
</style>`);
  html.push("</head><body>");

  let inCode = false;
  let inUl = false;

  const flushUl = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
  };

  for (const raw of lines) {
    const line = raw ?? "";

    if (line.startsWith("```")) {
      flushUl();
      inCode = !inCode;
      html.push(inCode ? "<pre><code>" : "</code></pre>");
      continue;
    }

    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }

    if (line.trim() === "---") {
      flushUl();
      html.push("<hr/>");
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushUl();
      html.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushUl();
      html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushUl();
      html.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }

    if (/^\-\s+/.test(line)) {
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${escapeHtml(line.replace(/^\-\s+/, "")).replace(/`([^`]+)`/g, "<code>$1</code>")}</li>`);
      continue;
    }

    flushUl();

    if (line.trim() === "") {
      html.push("<div style=\"height:8px\"></div>");
      continue;
    }

    html.push(
      `<p>${escapeHtml(line).replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`,
    );
  }

  flushUl();
  html.push("</body></html>");
  return html.join("\n");
}

async function main() {
  // Resolve paths from the repo root regardless of CWD.
  // This script lives at: <repoRoot>/docs/user-manual/generate-user-manual-pdf.mjs
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..", "..");

  const mdPath = resolve(repoRoot, "docs/user-manual/TallyMCP_User_Manual.md");
  const htmlPath = resolve(repoRoot, "docs/user-manual/TallyMCP_User_Manual.html");
  const pdfPath = resolve(repoRoot, "docs/user-manual/TallyMCP_User_Manual.pdf");

  const md = await readFile(mdPath, "utf8");
  const html = mdToBasicHtml(md);
  await writeFile(htmlPath, html, "utf8");

  // `pnpm --filter @tallymcp/configurator exec ...` runs with CWD inside
  // apps/configurator where Playwright is installed. Use CWD-scoped require
  // so module resolution doesn't depend on where this script lives.
  const requireFromCwd = createRequire(resolve(process.cwd(), "package.json"));
  const { chromium } = requireFromCwd("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
  });
  await browser.close();

  // eslint-disable-next-line no-console
  console.log(`[user-manual] wrote ${pdfPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

