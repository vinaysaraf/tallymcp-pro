# Changelog

All notable changes to this project will be documented in this file.

## v1.0.18 — Connect to a Server / networked TallyPrime from the GUI (no config editing) (2026-06-24)

### Added
- **"Where is TallyPrime?" setting in the Configurator** — pick **This PC** (`127.0.0.1:9000`) or **Server / another PC on the network** and enter the host (IP or hostname) + port, then **Save**. The connection is written to the MCP server's `config.json` for you, so connecting to a Tally running on an office server no longer requires hand-editing a config file. (Competing Tally-to-AI connectors typically require manual JSON edits and assume Tally is on the same PC; this closes both gaps.) Input is validated (non-empty host, port 1–65535) with plain-English errors. The live connection indicator follows the change automatically — the status poller now resolves its target from `config.json` on every tick (This PC ↔ Server) without a restart. Loopback hosts are recorded as a `local` connection, others as `server`. New `tally_set_tally_connection` IPC + `Settings` UI; `ConfigSnapshot` now reports the active `tallyHost`/`tallyPort`/`tallyConnectionType`. Backed by tests at the IPC, poller, preload, and component levels.

## v1.0.17 — Live voucher reads work on every edition (export + audit-lite voucher checks) (2026-06-24)

### Fixed
- **`tally_export_vouchers` returned an empty file, and audit-lite's voucher-level checks never fired, on TallyPrime Silver (and other editions that don't answer standalone collection exports).** The live voucher streamer (`getDayBookStream`) built a bare `TYPE=Collection` **Voucher** request. On those editions that request returns an **empty set** *and* ignores `SVFROMDATE`/`SVTODATE` (Tally serves whatever period is loaded), so voucher exports came back blank and the audit's no-narration / duplicate-number / round-figure / large-journal / backdated checks had no data to run on. The streamer now reads each chunk through the **report-form TDL** — the exact path `runReport("DayBook")` / `getDayBook` already use — which returns the vouchers **and honors the requested period natively**. Because the report-form is period-correct, the previous *loaded-period gate* (added as a workaround for the collection's period-blindness, which refused to stream unless Tally's loaded period covered the request) is **removed**: you no longer have to set the period in TallyPrime to match your query. Verified live on TallyPrime Silver — the FY streamed 317 vouchers (previously 0); an April-only request returned exactly the 28 April vouchers (proving the period is honored); audit-lite now surfaces its voucher-level findings.
- **Audit-lite over-/under-valued single-entry vouchers.** `voucherGross` used a half-sum of absolute entry amounts (which assumes both Dr and Cr sides are present). The report-form exposes one signed `$Amount` per voucher, so a single-entry voucher was valued at **half** its real amount — under-counting materiality. It now takes the larger of the two sides, which equals the voucher value for both single-entry and balanced double-entry vouchers. The voucher-export Summary-by-type "Value" total uses the same correct measure (previously it summed only positive entries, which could read 0 when the lone entry was a debit).
- **The MCP voucher / audit / dashboard tools were still gated off on Silver.** Fixing the service layer wasn't enough: `tally_export_vouchers`, `tally_run_audit_lite`, and `tally_export_dashboard` were blocked by a single `voucherQueriesViable` capability flag that the boot probe sets `false` on Silver — so on a *default* Silver install they still returned the "disabled on this Tally" gate error (pointing at file-import / `unsafeSlow`), and the service-layer fix above was unreachable through the actual tools. The capability is now **split in two**: `reportFormViable` (the period-scoped report-form path — Day Book / vouchers / audit / dashboards; works on **every** edition incl. Silver) and `computedBalancesViable` (the genuinely-slow per-ledger `$ClosingBalance` path). The three report-form tools now run natively on Silver with **no override**; only `tally_get_ledger_closing_balance` / `tally_get_group_closing_balances` stay edition-gated. Capability messages + tool descriptions updated accordingly; MCP-level regression tests added proving the report-form tools pass the gate on simulated Silver caps while the closing-balance tools do not.

### Removed
- Dead, edition-broken XML builders that the report-form path replaces: the bare `Voucher`-collection envelopes (`dayBookEnvelope`, `salesRegisterEnvelope`) and the loaded-period probe machinery (`currentPeriodEnvelope`, `getLoadedPeriod`). Master-object collection exports (companies / ledgers / groups / voucher types) are unchanged.

## v1.0.16 — Voucher export now also produces a formatted Excel workbook (2026-06-24)

### Added
- **`tally_export_vouchers` now writes a formatted `.xlsx` alongside the CSV.** The CSV remains the memory-safe streaming output; the new workbook adds a **Summary-by-type** sheet (per voucher type: # vouchers, # entries, total value with data bars + a TOTAL row) and a **Vouchers** sheet (one row per ledger entry) with styled header, banded rows, and a red-negative Amount column with data bars. The tool now returns both file paths.

## v1.0.15 — Richer, more insightful Excel exports (2026-06-24)

### Tests
- Hardened the temp-dir cleanup in three suites (output-store / config-store / mcp-server) with `rmSync` retries — a Windows CI runner intermittently threw `ENOTEMPTY` while deleting a freshly-written scratch dir (the assertions passed; only the cleanup raced). (This is why v1.0.14 didn't publish; v1.0.15 carries the same Excel changes plus this fix.)

### Changed
- **Every Excel download is now insight-rich and visually formatted**, not a bare data dump. The Excel engine gained native visual primitives (no chart dependency): a styled brand-blue header band, in-cell **data bars** on currency columns, **zebra-banded** rows, bold **TOTAL** rows, and per-row colour **tones** (section / good / bad / info / muted). These apply across all workbooks:
  - **Management Snapshot** — rebuilt as a true dashboard: KPI tiles (Revenue, Gross/Net Profit with margins, Cash & Bank, Receivables/Payables, Working Capital), a **Ratios** sheet (gross/net margin, current & quick ratio, debt-equity) each with a benchmark and RAG assessment, plus **Top Debtors**, **Top Creditors**, and **Expense Analysis** drill-downs. Figures are derived from the (now-correct) Trial Balance closing balances. *(Fixed a classification bug while building this — `direct expense` was matching `indirect expenses`, double-counting indirect items and understating profit.)*
  - **Sales Trend** — sales summary KPIs (total/avg invoice, best month, active customers), month-wise trend with **month-on-month growth %**, and a **Top Customers** sheet.
  - **Exceptions Overview** — severity counts with tones + data bars, a per-check breakdown, and a new **Findings detail** sheet (severity, code, title, evidence, suggested fix) that previously wasn't shown.
  - **Audit-lite workbook** — findings colour-coded by severity; books-score components with data bars.
  - **The 10 report exports** (Trial Balance, P&L, Balance Sheet, Day Book, Sales/Purchase Register, masters, etc.) — data bars on amount columns, banded rows, and TOTAL rows on the financial reports.

## v1.0.13 — Trial Balance shows closing balances and ties out (2026-06-24)

### Fixed
- **Trial Balance reported period *turnover* instead of *closing balances*, so it didn't behave like a real TB.** The connector mapped the TDL debit/credit *turnover* columns (total movement during the period) into the report and discarded the closing balance — so each ledger showed *both* a debit and a credit figure (movement), not its net Dr/Cr standing. The report now derives each ledger's **closing balance = opening + debit − credit** and presents it in a single Dr **or** Cr column. This equals Tally's `$ClosingBalance` for balance-sheet ledgers **and** gives the correct net for nominal/P&L ledgers — for which `$ClosingBalance` returns 0 over the XML interface, which would otherwise leave the TB un-tied (off by the year's profit). Because every voucher balances, **Σ debit = Σ credit, so the Trial Balance now ties out.** Verified live on TallyPrime Silver (Σ Dr = Σ Cr; every ledger single-sided). Regression test added covering tie-out and the nominal-ledger (`$ClosingBalance = 0`) case. This also makes audit-lite's negative-cash and suspense-balance checks read true closing balances rather than gross movement.

## v1.0.12 — Date parameters accept numeric input (every date-taking tool) (2026-06-24)

### Fixed
- **Date parameters rejected numeric input, breaking every date-taking tool through the MCP boundary.** `TallyDateSchema` was `z.string().regex(/^\d{8}$/)`, so when an MCP client / LLM sent a `YYYYMMDD` date as a JSON **number** (e.g. `20260331` without quotes — a very common LLM behaviour for all-digit values) Zod rejected it with *"Expected string, received number."* This blocked `tally_read_report`, `tally_export_report_excel` / `_json`, `tally_export_vouchers`, and the ledger/group closing-balance tools whenever an explicit period was given. `TallyDateSchema` now uses `z.coerce.string()` — a numeric date is coerced to a string and then validated by the 8-digit regex; string input and Tally-response parsing are unchanged, and malformed values (e.g. `"2025-26"`, `123`) are still rejected. Verified end-to-end: all 10 reports + bonus exports (masters, vouchers CSV, audit-lite, 3 dashboards) run live against TallyPrime Silver (17/17).

## v1.0.11 — Connection test detects loaded companies on Silver / multi-company (2026-06-24)

### Fixed
- **`tally_test_connection` falsely reported "no company loaded" on the installed app (TallyPrime Silver / multi-company).** The connection diagnostic (`diagnoseTally`) used a fallback "List of Companies" request in the bare `TALLYREQUEST=Export Data, TYPE=Data` form, which on TallyPrime Silver and multi-company setups returns an **empty `<DATA></DATA>`** even when companies are loaded — so it reported `NO_COMPANY_LOADED` and the entire `config` flow stalled. It worked only from a dev checkout (which has `samples/list-companies.request.xml`, the correct **Collection + TDL** form); the **deployed bundle ships no `samples/` folder**, so the installed server always fell back to the broken form. Fixes: (1) the inline `LIST_COMPANIES_ENVELOPE` is now the cross-edition **Collection + TDL** form — no dependency on a deployed `samples/` file; (2) `countCompanies` now matches real `<COMPANY …>` entries (those carry a `NAME` attribute), so the `<CMPINFO><COMPANY>0</COMPANY></CMPINFO>` *counter* element can no longer cause a false positive. Verified live against TallyPrime Silver with 3 companies loaded; regression tests added. (`tally_list_companies` already used the correct envelope and was unaffected.)

## v1.0.10 — Thumbprint-pinned update verification + license (2026-06-24)

### Security
- **Update signature is now pinned to the certificate THUMBPRINT, not just the CN.** v1.0.9's self-signed-tolerant check matched the certificate's *common name* (`CN=Vinay Saraf`), which any attacker could spoof by minting their own self-signed cert with the same CN — so a compromised GitHub release could have shipped a malicious installer that passed verification. The check (`verifyPublisherName`) now pins on the exact SHA-1 Authenticode **thumbprint** of the release-signing certificate (`EXPECTED_CERT_THUMBPRINTS`); a build signed by any other certificate — even one carrying the right CN — is rejected. Tampered (`HashMismatch`), unsigned, and untrusted-but-wrong-cert builds are still refused, SHA-512 verification against the HTTPS-served `latest.yml` is unchanged, and the check still fails closed (visible error) when the signature can't be inspected. (Resolves the automated security review's HIGH finding on the v1.0.9 bypass.)

### Added
- **`LICENSE` — PolyForm Noncommercial License 1.0.0.** The project is now explicitly free to use, modify, and distribute for any **noncommercial** purpose (personal, educational, research, charitable, government); commercial use requires a separate license (vinay@vinaysaraf.com). README + root `package.json` updated accordingly.

## v1.0.9 — In-app updater fix + Help menu (Update / About Me / ICAI Project) (2026-06-24)

### Fixed
- **In-app auto-update silently failed after downloading ("progress bar completes, then nothing happens").** electron-updater rejected every update because the app is signed with a **self-signed** certificate whose chain doesn't terminate in a CA root Windows trusts (`updater.log`: *"New version X is not signed by the application owner… terminated in a root certificate which is not trusted"*). The download and the SHA-512 integrity check both succeed; only the trusted-root requirement fails. The updater now installs a **publisher-name-pinned** signature check (`verifyPublisherName`) that accepts an intact Authenticode signature whose certificate CN matches the published publisher (`Vinay Saraf`) while tolerating the untrusted self-signed root — and still rejects tampered (`HashMismatch`), unsigned, or wrong-publisher builds. SHA-512 verification against the HTTPS-served `latest.yml` is unchanged. **NOTE:** because the rejecting check runs inside the *currently-installed* app, this fix only takes effect for updates installed **from v1.0.9 onward** — upgrading an existing v1.0.7/v1.0.8 install to v1.0.9 requires a **one-time manual install** of the v1.0.9 setup. (A trusted-CA code-signing certificate would remove even that one-time step and silence SmartScreen warnings.)
- **Failed updates are no longer invisible.** When a pending update can't be installed automatically, the home screen now shows an amber banner — *"TallyMCP vX couldn't be installed automatically… Download"* — linking to the release page, instead of the update banner vanishing with no feedback. The `error` update state now carries the release-notes URL so the link works.
- **Differential-download 404.** Releases now also upload the NSIS `.blockmap`, so electron-updater can fetch only the changed blocks instead of always falling back to a full download (`updater.log` previously showed a 404 on `…​.exe.blockmap`).

### Added
- **Help menu** with three actions:
  - **Update** — check, then (with consent) download + install, with a "Download from website" fallback whenever the update can't be applied automatically.
  - **About Me** — CA Vinay Saraf · Membership No. 518215 · vinay@vinaysaraf.com · GitHub (opens the profile).
  - **ICAI Project** — project summary · Programme: AI ICAI Level II · Batch 44 · Gurugram.

## v1.0.8 — Report-correctness + company/period safety fixes (2026-06-23)

### Fixed
- **Wrong company could be returned silently (`tally_company_info`).** Tally's `Company` collection returns EVERY loaded company, and `getCompanyInfo` took the first node — so on a multi-company machine it reported the alphabetically-first/active company's metadata regardless of which was requested. It now matches the requested company by name and raises a clear "not loaded — open it in Tally / check the exact name" error when absent. Verified live across several companies.
- **Company-verification guard (never export another company's books).** Every company-scoped tool now confirms, via Tally's `$$CurrentCompany`, that the requested company is actually the one being served before any data is read; on a definitive mismatch it refuses with an actionable error instead of silently returning a different company's data. (`getCurrentCompany` connector + `currentCompanyEnvelope`; wired through `McpContext.assertCompany`.)
- **Forex / multi-currency amounts crashed the parse.** Ledgers in a foreign currency arrive as `"-3673.88 $ @ ? / $ = ? 0.00"`; `parseTallyAmount` threw `Cannot parse Tally amount`, aborting Ledger Masters / Trial Balance for any company with forex ledgers. It now reduces to the base-currency value (after the last `=`) and strips currency symbols / the `?` rate placeholder.
- **Raw Day Book stream ignored the period and duplicated vouchers (audit-lite + voucher CSV).** A bare `Voucher` collection serves Tally's *current* period for every request, so chunked reads returned out-of-range vouchers and repeated the same ones across chunks (inflating e.g. the duplicate-number check). `getDayBookStream` now filters to the requested date range client-side and de-duplicates by a content fingerprint — keeping genuine same-number vouchers (which differ in date/entries). Confirmed it returns the same count as the period-correct TDL Day Book.
- **`Cannot parse Tally amount: "[object Object]"` crash during Excel export.** Some TallyPrime installs return amount/balance and text fields with an XML attribute (e.g. `<OPENINGBALANCE TYPE="Amount">10,000.00</OPENINGBALANCE>`), which `fast-xml-parser` represents as `{ "@_TYPE": "Amount", "#text": "10,000.00" }`. The collection-based connectors coerced these with a bare `String(node.FIELD)`, producing the literal string `"[object Object]"` — which then crashed `parseTallyAmount`, aborting `tally_export_report_excel` for **Ledger Masters** (and the same risk existed in the streaming Day Book voucher path used by audit-lite and dashboards). New `nodeText()` helper in `@tallymcp/tally-xml` unwraps `#text` before coercion; every collection connector (`list-ledgers`, `list-groups`, `list-voucher-types`, `list-companies`, `company-info`, `date-utils`) and `voucher-normalize` now route field reads through it. The TDL-backed reports (Trial Balance, P&L, Balance Sheet) were never affected — `tdl-engine`'s parser already unwraps `#text`.
- **Day Book & Sales Register were missing amount, party, ledger, reference and narration.** A raw `Voucher` collection does not populate method-backed fields (`$Amount`, `$PartyLedgerName`, `$LedgerName`, `$Narration`, `$Reference`) unless they are explicitly fetched — so all five came back empty/0. Fixed by adding them to `<FETCH>`. The amount field additionally had a malformed expression (`$$StringFindAndReplace:$$Number:$$String:$Amount:...` — missing parentheses around the numeric sub-expression, so TDL mis-parsed the `:`-delimited arguments and returned empty); corrected to `$$StringFindAndReplace:($$Number:$Amount):"(-)":"-"` (the working Trial Balance pattern). Both exports now show **Party, Ledger (particulars), Reference, Amount and Narration** columns, the new `ledger`/`amount` fields are surfaced top-level on the `Voucher` type, and the **Sales Trend** dashboard (which sums sales-voucher amounts) now shows real figures instead of zero.
- **Balance Sheet double-counted and never tied out.** The connector summed *every* non-revenue group — primary groups **and** their sub-groups — but a parent's closing already aggregates its children, so the totals were inflated and the sheet never balanced. It now keeps only primary (top-level) groups and appends a single **Profit & Loss A/c** balancing line equal to `-(sum of the other primary groups)` — which, by double-entry, is exactly Tally's combined brought-forward + current-period P&L figure. The signed Amount column now ties to zero (verified live — the asset and liability sides tie to the same total). Empty `Sub Group`/`Ledger` columns were dropped from the layout.

### Added
- **`nodeText()`** in `@tallymcp/tally-xml` — single source of truth for reading a parsed XML field that may be a string, number, `#text`-wrapped object, or array. Unit-tested for each shape (incl. an explicit guard that it never yields `"[object Object]"`).
- **Live end-to-end feature harness** (`apps/mcp-server/scripts/run-all-features.ts`) — drives all 10 standard reports + the bonus features (masters/vouchers export, audit-lite Books Score, 3 dashboards) through the exact service functions the MCP tools call, against a live TallyPrime. Verified 17/17 features pass on a live company (Ledger Masters exported cleanly at several-thousand-row scale — the report that previously crashed).
- **`getCurrentCompany` connector + `currentCompanyEnvelope`** in `@tallymcp/report-engine` / `@tallymcp/tally-xml` — probe Tally's actual current company (`$$CurrentCompany`) to back the verification guard above.

### Tests
- Regression tests: `nodeText` shape coverage (`tally-xml`), an attribute-carrying `OPENINGBALANCE`/`PARTYGSTIN` ledger fixture (`master-connectors`), and an attribute-carrying voucher `AMOUNT`/`LEDGERNAME` case (`voucher-normalize`).

## v1.0.7 — TDL data files travel with the bundle + auto-updater logging (2026-06-23)

### Fixed
- **`report-catalog.json not found` on the installed build.** The TDL engine reads `report-catalog.json` + template XMLs from disk at runtime, but the v1.0.5 single-bundle build shipped only the JS — so every TDL-routed report (Trial Balance, P&L, Balance Sheet, Day Book, Sales Register) and audit-lite failed on the installed app with a missing-file error. The build now copies these data files next to `main.bundle.js`, the deploy ships them into `<installDir>\mcp-server\`, and `tdl-engine/catalog.ts` resolves them bundle-adjacent-first (with the package-root layout as a dev fallback). A new bundle-smoke assertion guards that the data files travel with the bundle.

### Added
- **Auto-updater logging.** `electron-updater` now writes every check/download/verify event to `<userData>\logs\updater.log` (and stderr). Previously the updater had no logger wired, so a failed in-app update looped silently with no diagnosable error — this surfaces the real cause. (Combined with the install being per-user, in-app updates from v1.0.7 onward are expected to work.)

## v1.0.6 — Config backup/restore + shorter output paths (2026-06-23)

### Added
- **Per-AI-client config backup + one-click Reset.** Every write to a client config is now preceded by a timestamped backup, and the Configurator offers a **Reset config** button that restores the most recent backup (stating its date) — recoverable even when the live config was wiped or corrupted. (`@tallymcp/client-wirer`: `backupTimestamped` / `listBackups` / `restoreLatest` / `ClientWirer.restore` / `hasBackups`; Configurator: `RESTORE_CONFIG` IPC, `ResetConfigModal`, `restorableClients` surfaced from the health check.) (#13)

### Fixed
- **Generated file paths no longer exceed Windows' 259-character limit** ("Cannot open the file because the file path is more than 259 characters"). A relative `output.folder` (default `./tallymcp-output`) is now resolved against the user's HOME directory instead of the AI-client-chosen working directory, and the filename timestamp is shortened to `YYYYMMDD-HHMMSS`. (#14)

### Changed
- Repo hygiene: stopped tracking `.cursor/rules` and `ai-review` artifacts, hardened `.gitignore`, and de-branded the README to a personal-project attribution.

## v1.0.5 — Bundle MCP server (eliminates the ERR_MODULE_NOT_FOUND class of bugs) (2026-05-28)

Architecture-level hotfix that resolves the systemic failure mode behind v1.0.3 / v1.0.4 missing-module crashes (`zod-to-json-schema`, then `undici`, then `ajv` in sequence after each one-off hotfix). Root cause is pnpm's symlink-based runtime dependency layout not surviving Windows NSIS extraction; the surface area is ~50 transitive dependencies, so individual-package hotfixes don't scale. Solution: bundle the entire MCP server into a single self-contained JavaScript file with esbuild. The deployed `mcp-server/` ships exactly three files (`main.bundle.js`, `main.bundle.js.map`, `package.json`) — no `node_modules` directory at all.

### ⚠ ACTION REQUIRED AFTER UPGRADE — Reconfigure each AI client

electron-updater installs the new files but does NOT touch your AI client configs. If you wired Claude Desktop / Cursor on v1.0.3 or v1.0.4, those config files still reference the OLD path `mcp-server\dist\main.js` — that path no longer exists in v1.0.5 (the bundle is at `mcp-server\main.bundle.js`). You'll see ERR_MODULE_NOT_FOUND or "module not found" in Claude Desktop logs until you:

1. Open the Configurator (auto-updates to v1.0.5)
2. For each `✓ Connected` tile, click **Reconfigure** (writes the new bundle path into the AI client config)
3. Fully quit the AI client from the system tray (right-click → Quit), then reopen

After step 3, the MCP server spawns cleanly.

### Fixed
- **MCP server startup crashes on missing transitive dependencies** (#152 CRITICAL — supersedes v1.0.4's partial fix). The installer's deployed `mcp-server/` no longer carries a fragile pnpm symlink graph. Instead, esbuild bundles the entire dependency tree into `main.bundle.js` at build time. ~50 transitive npm packages collapse into a single ~4.2 MB file that has zero runtime `node_modules` resolution. Windows NSIS extraction, AppContainer restrictions, Defender real-time scanning, Group Policy file-system policies — none of these can break the install anymore because there are no symlinks to flatten and no sibling packages to misplace. ExcelJS (the highest bundling risk) bundles cleanly with no `external` carve-out needed.
- **Install footprint drops dramatically.** Previous installer extracted thousands of files (~50 MB) into `mcp-server/`. v1.0.5 extracts 3 files (~12 MB incl. sourcemap). NSIS extraction time goes from ~10 minutes (Defender scanning every file) to ~5 seconds. Each Claude Desktop / Cursor MCP invocation now spawns a single bundled `node.exe main.bundle.js` instead of resolving thousands of node_modules paths.

### Added
- **Bundle smoke test in vitest** — `apps/mcp-server/test/bundle-smoke.test.ts` spawns the built `dist/main.bundle.js` and asserts no `ERR_MODULE_NOT_FOUND` / `Cannot find package` in stderr within a 4-second window, and treats an unexpected clean exit as failure. Catches the v1.0.3 + v1.0.4 regression class BEFORE ship. The mcp-server `test` script now chains `pnpm run build && vitest run ...` so the smoke always runs against a freshly-built bundle.
- **esbuild config at `apps/mcp-server/esbuild.config.mjs`** — declarative bundling with `format: "esm"`, `target: "node20"`, `createRequire` banner for CJS interop, and linked sourcemap for stack-trace debugging.

### Changed
- `apps/mcp-server/package.json` — added `esbuild` as `devDependency`; `build` script now runs `tsc && node esbuild.config.mjs`. Production `dependencies` block unchanged (still consumed by `pnpm install` for dev work + workspace tests against `dist/main.js`).
- `installer/scripts/deploy-mcp-server.mjs` — replaced the `pnpm deploy --prod` step with a 3-file copy (`main.bundle.js`, `main.bundle.js.map`, minimal `package.json`).
- Wire path migrated from `mcp-server/dist/main.js` to `mcp-server/main.bundle.js` across 11 files (`ipc-handlers.ts` + test, `ipc-types.ts` JSDoc, `electron-builder.yml` comments, `cli/wire.ts` + test, `install-smoke.ps1`, `mcp-client-setup.md`, `phase3-manual-smoke.md`, `installer/README.md`, `defender-exclusion.md`).
- `apps/configurator/package.json` version 1.0.4 → 1.0.5.

### Notes
- The bundle is not minified (`minify: false`) so stack traces and error messages remain readable. The sourcemap allows full debugging if needed.
- No native dependencies in our current runtime graph (only optional macOS `fsevents`). If one is added later, esbuild's `external` option carves it out and the dep ships alongside the bundle.
- **Wire-path API change**: the internal entry path written into AI client configs changed from `mcp-server/dist/main.js` to `mcp-server/main.bundle.js`. This only affects clients wired in v1.0.5+. Configs from v1.0.3 / v1.0.4 still reference the old path until the user clicks Reconfigure — see the ⚠ ACTION REQUIRED block above. The DEV path `apps/mcp-server/dist/main.js` (tsc output for workspace tests) is unchanged.
- v1.0.3 + v1.0.4 features (MSIX detection, Disconnect button, wire-time MSIX warning, DoneScreen tray-quit + caveat) carry through unchanged.
- Open follow-ups deferred to v1.0.6: NSIS welcome macro for cleaner upgrade UI; `differentialPackage` config for smaller update downloads; `RMDir /r mcp-server/node_modules` in uninstaller (only if real-world orphans observed); auto-Reconfigure on first launch after upgrade; #138 (Restart Tally modal after autofix); #134 (edition heuristic refinement); #136 (TB/P&L/BS over-gating fix).

## v1.0.4 — CRITICAL: missing zod-to-json-schema in deployed mcp-server (2026-05-27)

Critical hotfix shipped immediately after v1.0.3 surfaced a latent install-layout bug. The MCP server crashes on startup with `ERR_MODULE_NOT_FOUND: Cannot find package 'zod-to-json-schema'` because `@modelcontextprotocol/sdk@1.29.0` imports the package but pnpm's symlink-based layout for transitive deps doesn't survive electron-builder's NSIS extraFiles copy on Windows. The bug has been latent since v1.0.1 — users on hot-patched installs didn't hit it; v1.0.3 auto-update overwrites the hot-patch with the broken installer layout, so the bug surfaces on first Claude Desktop ↔ MCP server contact.

### Fixed
- **MCP server `ERR_MODULE_NOT_FOUND: zod-to-json-schema` on startup** (#152 CRITICAL). Added `zod-to-json-schema: ^3.25.1` as a direct dependency of `@tallymcp/mcp-server`. This forces pnpm deploy to hoist the package to the top-level `node_modules/zod-to-json-schema/` in the staging tree (verified locally: `installer/staging/mcp-server/node_modules/zod-to-json-schema/` now present). The package then ships at a stable, Windows-friendly location that doesn't rely on `.pnpm` symlinks surviving NSIS file extraction. Root cause: the SDK's transitive `zod-to-json-schema` dep lived only inside `.pnpm/@modelcontextprotocol+sdk@*/node_modules/` as a symlink — symlinks get flattened on Windows during NSIS extraction, leaving the SDK file unable to resolve its own import.

### Changed
- `apps/mcp-server/package.json` — added `"zod-to-json-schema": "^3.25.1"` to dependencies. No source code change required (the SDK pulls it in transitively at runtime).
- `apps/configurator/package.json` version 1.0.3 → 1.0.4.
- `pnpm-lock.yaml` regenerated to record the new direct-dep edge.

### Notes
- Users on auto-updated v1.0.3 with broken MCP need v1.0.4 to actually use TallyMCP. Auto-update via electron-updater will pick it up within ~5 sec of next Configurator launch.
- No new tests added for v1.0.4 — this is a package-layout fix, not a code change. The bug is invisible to vitest (workspace runs from source). Detection mechanism added in v1.0.5+ should run the staged `installer/staging/mcp-server` through a smoke test that loads `dist/main.js` with the staged `node_modules` to catch this class of regression.
- v1.0.3's UI changes (MSIX detection, Disconnect button, wire-time MSIX warning, DoneScreen tray-quit + caveat) all carry through unchanged.

## v1.0.3 — MSIX/Store Claude Desktop detection + restart toast + Disconnect (2026-05-27)

Critical hotfix shipped same-day as v1.0.2 after a real-world remote-install via AnyDesk on a friend's Gold Tally machine surfaced that the Configurator wires Claude Desktop to the wrong path when the user installed Claude Desktop from the Microsoft Store. The Store version is AppContainer-sandboxed under `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` instead of the standard `%APPDATA%\Claude\` — v1.0.2 only wrote to the standard path, so Store-version Claude Desktop never saw TallyMCP. Same hotfix surfaces a one-click Disconnect button on every configured client tile so non-technical users can cleanly remove TallyMCP from any AI tool without editing JSON.

### Fixed
- **MSIX/Store Claude Desktop config detection** (#140 CRITICAL). New `resolveClaudeDesktopConfigPaths(env, fs)` helper in `@tallymcp/client-wirer` (6 unit tests) scans `%LOCALAPPDATA%\Packages\` for `Claude_*` entries. `ClientWirer.add()` now writes to ALL applicable Claude Desktop config paths — both standard and MSIX sandbox if both exist. `ClientWirer.remove()` strips from the same path set so disconnect cleans every flavor in one click. `detectConfiguredClients` in `handleHealthCheck` probes the same path set, so the HealthCheck tile reflects reality regardless of which Claude Desktop flavor the user has. `WireResult` / `WireResponse` extended with `configPaths: string[]` + `variants: ("standard"|"msix")[]` to carry the multi-path info through to the renderer.

### Added
- **Post-wire restart toast with MSIX caveat** (#139, #140). `DoneScreen.tsx` rewritten — for Claude Desktop, renders explicit "right-click the Claude Desktop icon in the system tray → Quit, then reopen" instructions (closing the window doesn't reload the config). When `variants` includes `"msix"`, an amber caveat card surfaces the Store-version AppContainer limitation and recommends installing the standalone version from `claude.ai/download` if the wire-up doesn't take effect. For non–Claude-Desktop clients (Cursor, Claude Code, LM Studio, Ollama), the existing generic restart copy is preserved.
- **Wire-time MSIX warning in `AddMcpModal`** (#140, Cursor plan-review rec #2). When the user clicks "+ Add MCP" on the Claude Desktop tile AND `HealthCheckResponse.claudeDesktopVariants` includes `"msix"`, the modal renders an amber warning card BEFORE the Add MCP button. Users learn about the AppContainer caveat (and the `claude.ai/download` standalone alternative) upfront — no wasted tray-quit cycle. The path-display block in the modal also shows both `%APPDATA%\Claude\…` and `%LOCALAPPDATA%\Packages\Claude_*\…` when MSIX is detected.
- **One-click Disconnect button on configured tiles** (#141). Every connected client tile (`✓ Connected`) now shows a red **Disconnect** button next to **Reconfigure**. Click → small confirm modal ("Disconnect TallyMCP from <Client>? We'll surgically remove only the `tallymcp-pro` entry — your other MCP servers, data, and <Client>'s own settings are unaffected.") → click Disconnect → tile flips back to `+ Add MCP`. Backend wiring (`ClientWirer.remove`, `handleUnwireMcp`, UNWIRE_MCP IPC, `unmarkClientConfigured` store) was already in place from v1.0.2; v1.0.3 adds the UI surface (Disconnect button on `ClientTile.tsx`, new `DisconnectConfirmModal.tsx` component, `handleDisconnect` + `handleConfirmDisconnect` in `App.tsx`).

### Changed
- `apps/configurator/package.json` version 1.0.2 → 1.0.3.
- `packages/client-wirer/src/wirer.ts` — `add()` and `remove()` iterate all resolved config paths; combined action is `added` if any path was added, `updated` if any was updated, `noop` only when all paths were already correct.
- `packages/client-wirer/src/types.ts` + `apps/configurator/src/shared/ipc-types.ts` — `WireResult` / `WireResponse` / `UnwireResult` / `UnwireResponse` extended with `configPaths` + `variants`. `configPath` (singular) retained as `=== configPaths[0]` for back-compat with v1.0.2 consumers.
- `apps/configurator/src/renderer/components/TileGrid.tsx` + `ClientTile.tsx` — added `onDisconnect` prop threaded from `App.tsx`.

### Public API note (v1.0.3 type-constructor breaking change)
- `@tallymcp/client-wirer` exported types `WireResult`, `UnwireResult` (and the corresponding configurator IPC types `WireResponse`, `UnwireResponse`) now REQUIRE the new `configPaths: string[]` field (and `variants: ClientConfigVariant[]` on the wire side). Code that READS these types is unaffected — `configPath` (singular) is still present and equal to `configPaths[0]`. Code that CONSTRUCTS these literals (e.g. test mocks of `wireMcp` / `unwireMcp`) must add the new fields. `ClientConfigVariant = "standard" | "msix"` is newly re-exported from `@tallymcp/client-wirer`.
- Manual verification recommended on real Store-Claude install: install or upgrade to v1.0.3, click **+ Add MCP** on Claude Desktop → confirm the amber MSIX warning appears in the modal → wire → DoneScreen shows tray-quit instructions + MSIX caveat card → quit Claude Desktop from system tray → verify `tallymcp-pro` entry lands in `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json`. If MCP tools still don't appear in Claude Desktop after restart, install the standalone Claude Desktop from `claude.ai/download` (documented AppContainer caveat). Users who wired the standalone first and later installed the Store version should click **Reconfigure** on the Claude Desktop tile so v1.0.3 picks up the new MSIX path.

### Notes
- The MSIX detection helper uses a generic `existsSync` + `readdirSync` probe interface so v1.0.4+ can extend it to detect other future Claude Desktop install variants without changing the wirer's API.
- Disconnect is destructive but reversible — the confirm modal mirrors the existing `RestoreConfirmModal` pattern (Cancel + red destructive action). The pre-existing `.bak` backup created at first wire is preserved through disconnect, so users could even manually restore the prior config state if needed.
- Test count: client-wirer +12 (paths helper 6 + types 2 + wirer-add MSIX 4); configurator +18 (DoneScreen variants 4 + ipc-handlers MSIX 4 + AddMcpModal MSIX 3 + ClientTile disconnect 3 + DisconnectConfirmModal 4). Total v1.0.3 adds **+30 tests** across the workspace (client-wirer 45→57, configurator 122→140).
- Cursor plan-review verdict was ⚠ NEEDS REVISION; all 3 blocking issues (tm-yellow/tm-red Tailwind, public-api.test.ts) and 6 recommendations (wire-time MSIX warning, data-testid, FakeExecRunner, code comments) folded into the plan before execution.
- Open follow-ups deferred to v1.0.4: #138 (Restart Tally modal after autofix), #134 (edition heuristic refinement), #136 (TB/P&L/BS over-gating fix), aria-describedby on modals, optional success/Already-disconnected toasts.
- v1.0.3 is a same-day hotfix; v1.0.2's defender-exclusion docs, timeout, gateway visibility, and prompt rewrites all carry through unchanged.

## v1.0.2 — Remote-install UX + connector hardening (2026-05-27)

Patch release surfacing fixes from real-world v1.0.1 install on the user's networked TallyPrime setup (Tally Gateway Server=PAKHI:9999, 11 custom TDLs, dual Claude+Cursor MCP wire). Prepares the installer for a downstream remote install via AnyDesk on a friend's Gold Tally instance.

### Fixed
- **`tally_list_companies` no longer rejects display-format dates** (#133, already shipped on `main` via PR #8). `listCompanies` now routes `STARTINGFROM` + `BOOKSFROM` through `normalizeTallyDate()` (extracted to shared `connectors/date-utils.ts`), accepting both `20240401` (canonical) and `1-Apr-2024` (display format / Silver). 3 regression tests cover the matrix.
- **NSIS installer's empty progress pane fixed** (#126). `installer/installer.nsh` gets a `!macro customHeader` block with `ShowInstDetails show` + `ShowUninstDetails show` — the only hook expanded AFTER electron-builder's `common.nsh` `nevershow`. Companion `installer/scripts/patch-installSection.mjs` (beforePack) replaces `SetDetailsPrint none` → `SetDetailsPrint both` in `node_modules/.../installSection.nsh` so the per-file extraction log actually prints. Without both, slow installs (Defender real-time scanning) feel frozen.
- **MCP server prompts rephrased to avoid Claude's prompt-injection guardrail** (#132). All 6 prompts (`config`, `read`, `export`, `audit`, `dashboard`, `help`) rewritten from imperative ("Run X first. If it succeeds, call Y...") to descriptive prose ("Tools relevant for this task: X verifies Y. A typical sequence uses these in order."). New `apps/mcp-server/test/prompts-guardrail.test.ts` asserts no prompt content matches the imperative-pattern regex. Prompt `name` / `arguments` schemas preserved — existing user configs continue to work.

### Added
- **Connector request timeout** (#128). New `TallyRequestTimeoutError` class (exported from `@tallymcp/tally-connector`). `client.post(xml, { timeoutMs })` accepts a per-call override; instance-level default via constructor; global default via new `config.tally.requestTimeoutMs` field (defaults 30000); env var `TALLYMCP_TIMEOUT` overrides everything. Replaces the previous 60s body / 30s headers undici split — single 30s total now, fail-fast instead of hanging indefinitely. `pnpm diagnose-tally` maps to a new `REQUEST_TIMEOUT` diagnostic code with the gateway-reachability hint. Critical safety net for networked Tally setups where `Ignore Tcp Timeout=Yes` in tally.ini would otherwise let Tally wait forever for an unreachable gateway.
- **HealthCheck: Tally Gateway Server info** (#129). `HealthCheckResponse.tallyGatewayServer?: string` populated from tally.ini parse (case + whitespace tolerant regex). Renders a yellow ⚠ card in the Configurator: "Tally Gateway Server: HOST:PORT — networked client mode. If gateway is unreachable, Tally may hang on heavy queries." Also adds `HealthCheckResponse.tallyEdition?: "silver" | "gold" | "unknown"` (read from `config.tally.assumedEdition` if set) with an info row above the Patch A card.
- **HealthCheck: Dual-client warning** (#131). When `configuredClients.length > 1`, renders a yellow ⚠ card: "N AI clients configured. Each runs its own MCP server. Tally's XML interface is single-threaded — use one client at a time during heavy operations." Catches the dual Claude+Cursor wire pattern that overloads Tally during audit-lite (Cursor's deep-analysis finding 2026-05-27).
- **HealthCheck: Multiple-installs warning + disabled Fix button** (#137). `multipleTallyInstalls` was already returned by `handleHealthCheck` but never rendered. Now shows a yellow ⚠ card listing all detected install paths + disables the Fix button with explanatory label ("Fix both (disabled — multiple installs)") since `handleTallyFix` throws on `>1` installs. Prevents the bad UX of a button that always fails.
- **Docs**: new `docs/v1-installer-defender-exclusion.md` — folder-scoped AV exclusion guide for 7 major antivirus products (Defender, Bitdefender, Norton, McAfee, Kaspersky, Sophos, Quick Heal) + managed-Windows IT-approval section + diagnostic PowerShell snippet. Cancel-button-during-install note added to `docs/v1-installer-phase4-manual-smoke.md` (Known Phase 4 limitations).
- **Tests**: configurator 114 → 122 (+8 for the 3 HealthCheck additions). tally-connector 23 → 26 (+3 for timeout). mcp-server 14 → 16 (+2 for prompt guardrail). report-engine 44 → 47 (+3 for #133 date format, already on main). Total v1.0.2 adds +16 tests across 4 packages.

### Changed
- `apps/configurator/package.json` version 1.0.1 → 1.0.2.
- Root `package.json` `package` script: inserts `node installer/scripts/patch-installSection.mjs` before the electron-builder invocation.

### Notes
- Per the v1.0.2 plan (`ai-review/v1.0.2-plan-for-remote-gold-install.md`), the following are deferred to v1.0.3+: edition heuristic refinement (#134), Silver over-gating fix for TB/P&L/BS (#136), audit-lite sequential + progress streaming (#130), TDL `$$Walk:Voucher` workaround for Silver users (#135).
- v1.0.2 was reviewed by Cursor on `ai-review/v1.0.2-plan-for-remote-gold-install.md` with verdict ✅ APPROVED TO EXECUTE.

## v1.0.0-phase4 — Release pipeline + auto-update (2026-05-26)

### Added
- **`.github/workflows/release.yml`** — tag-triggered (`v*.*.*`) release pipeline on `windows-latest`. Runs the full local gate (build/lint/test/typecheck/e2e), decodes `CSC_LINK_BASE64` to a temp `.pfx`, signs the `.exe` via electron-builder + signtool, generates `latest.json`, and uploads the 4 artifacts (`.exe`, `.sha256`, `latest.yml`, `latest.json`) to the GitHub Release via `softprops/action-gh-release@v2`.
- **Real `electron-updater` integration** in `apps/configurator/src/main/auto-update.ts` (replaces Phase 2's `checkForUpdatesStub`). Wraps the `autoUpdater` singleton with a typed state-machine factory `createAutoUpdater`. State machine: `up-to-date` → `update-available` → `downloading` → `ready-to-install` (sticky `error` on any failure). `autoDownload = false` + `autoInstallOnAppQuit = false` enforce explicit user-clicks-Update consent. **Cursor C1 split**: `downloadUpdate` returns immediately + progress streams via the subscriber; `quitAndInstall` is a separate IPC the renderer invokes only when the banner is in `ready-to-install`. **Cursor H1**: `downloadUpdate` captures rejection into the error state instead of throwing.
- **`UpdateBanner` React component** — calm blue banner above StatusBanner + ErrorBanner. Renders one of four shapes per `UpdateStatus.status`: available → progress bar → restart → null. Includes "What's new" link to the release notes URL.
- **IPC schema**: `UpdateStatus` discriminated union, `UPDATE_STATUS_EVENT`, 3 new `IPC_CHANNELS` (`CHECK_FOR_UPDATES`, `DOWNLOAD_UPDATE`, `QUIT_AND_INSTALL`), 4 new `TallymcpApi` methods (`checkForUpdates`, `downloadUpdate`, `quitAndInstall`, `subscribeUpdateStatus`).
- **Zustand `updateStatus` slice** + `updateDismissedThisSession` flag + `setUpdateStatus` + `dismissUpdate` actions.
- **`installer/scripts/generate-latest-json.mjs`** — pure-function-cored Node script generating the spec Appendix C `latest.json` from version + sha256 + tag/repo env vars. **Cursor H2 guard**: rejects tag/version mismatch (`tag !== "v" + version`) so an out-of-sync tag-push can't produce a `latest.json` pointing at a non-existent artifact.
- **+23 net new configurator unit tests** (2 IPC type + 4 preload + 9 auto-update + 5 UpdateBanner + 2 store + 1 App integration). Configurator: 91 → 114. Plus 3 generate-latest-json tests outside the workspace.
- **Three new docs**: `docs/v1-installer-phase4-release-procedure.md`, `docs/v1-installer-phase4-secrets-setup.md`, `docs/v1-installer-phase4-troubleshooting.md`.

### Changed
- `apps/configurator/electron-builder.yml` — `publish: null` → `publish: { provider: github, owner: vinaysaraf, repo: tallymcp-pro, releaseType: release }` so electron-builder generates `latest.yml` and the release workflow can upload artifacts via `--publish always`.
- `apps/configurator/src/main/index.ts` — IPC registration is split (Cursor H3 + E2E regression fix `d2ad21a`): the 6 core channels register via `registerIpcHandlers(...)` BEFORE `await createWindow()` so the renderer's mount-effect `healthCheck` + `getConfig` IPC calls find handlers waiting; the 3 update channels (`check-for-updates`, `download-update`, `quit-and-install`) register inline AFTER the `createAutoUpdater(...)` bootstrap succeeds. The auto-updater bootstrap itself is wrapped in `try/catch` so dev / Playwright E2E (unpackaged Electron, where `electron-updater` may not initialize) still gets the core app — only the update banner is missing.
- `apps/configurator/src/main/ipc-handlers.ts` — `RegisterContext` is back to `{ installDir, version }`; the optional `autoUpdater?` field has been removed since the 3 update channels are now registered inline in `main/index.ts`.

### Notes
- The user manually opens the GitHub Release page to edit notes (Step 8 of the release procedure). The "What's new" link in the banner already points at the release page.
- No silent background install: `autoDownload` + `autoInstallOnAppQuit` are both false. User explicitly clicks "Update now" then "Restart now" (spec §10).
- SHA-256 verification is delegated to `electron-updater` (signed by electron-builder via signtool transparently).

## v1.0.0-phase3.1 — Admin/elevation UX hotfix (2026-05-26)

### Added
- **`detectIsElevated(runner): Promise<boolean>`** in `@tallymcp/tally-autofix` — runs `net session 2>nul` and returns true on exit 0. Used by the Configurator's HealthCheck to render an admin-needed hint when applicable.
- **`TallyIniLockedError`** error class in `@tallymcp/tally-autofix`. Thrown by `fixXmlInterface` when the underlying write fails with `EPERM`/`EACCES`. Carries a CA-friendly message ("Couldn't edit tally.ini at <path>. This usually means TallyPrime is currently running...") that replaces the raw OS error in the renderer's ErrorBanner.
- **`GroupPolicyError`** error class + `firewallRule: "group-policy-blocked"` outcome in `TallyAutofixer.ensureFirewallRule`. The library used to throw a generic `Error` with a "Group Policy" message; now it throws the typed class and the `TallyAutofixer` wrapper catches it into a discriminated outcome the IPC contract exposes.
- **`HealthCheckResponse.isElevated?: boolean`** — optional field populated by `handleHealthCheck` via `detectIsElevated`. Drives the Fix button's "(Admin needed)" label + a small "Right-click → Run as administrator" hint.
- **`ITPolicyHelpModal` React component** — opens when `handleFixAll` sees `firewallRule === "group-policy-blocked"`. Shows the exact `netsh` command IT can run, the equivalent `New-NetFirewallRule` PowerShell, and a "skip if loopback-only" reassurance with the technical reason.
- **Zustand `firewallSkipReason` slice** — `"non-admin" | "group-policy" | undefined`. Set by `handleFixAll` based on the `tallyFix` response. Auto-cleared on screen navigation (extends Phase 2's `navigateTo` `lastError` clear).
- **HealthCheck Patch A yellow card** — renders below the status list when `firewallSkipReason === "non-admin"`. Explains that the XML interface change DID apply, that AI tools on this same PC still work over loopback, and that the firewall rule is only needed for multi-machine setups.
- **HealthCheck Patch C admin pre-flight** — when `status.isElevated === false` and a fix is needed, the Fix button reads "Fix both (Admin needed) →" and a hint above it suggests "Right-click TallyMCP → Run as administrator, OR follow the manual steps after clicking Fix."
- **+14 net new configurator unit tests** (2 handleHealthCheck.isElevated + 2 store + 3 HealthCheck Patch A — incl. Cursor H1 Re-check gate — + 2 HealthCheck Patch C + 3 ITPolicyHelpModal + 2 App-level) plus **+8 in `@tallymcp/tally-autofix`** (4 elevation including the defensive exit-code test added during code review + 2 TallyIniLockedError + 2 GroupPolicyError/group-policy-blocked). Configurator count: **76 → 90**. `@tallymcp/tally-autofix` count: **44 → 52**. All Phase 1 + Phase 2 + v0.7 tests unchanged + green.

### Changed
- `TallyAutofixer.ensureFirewallRule` return type widened from `"added" | "noop" | "skipped-non-admin"` to add `"group-policy-blocked"`. Backwards-compatible for callers that exhaustively switch on the union (they'll get a TypeScript hint about the new variant).
- `TallyFixResponse.firewallRule` IPC field widened identically.
- `@tallymcp/cli` `TallyFixResult.firewallRule` widened to match (Task 4 code-review follow-up) and `apps/cli/src/main.ts` gained an explicit `else if (result.firewallRule === "group-policy-blocked")` branch with IT-policy guidance — previously the CLI silently printed `✓ Firewall rule: group-policy-blocked` (wrong; IT-policy block is a warning, not success).

### Notes
- No new IPC channels — `HealthCheckResponse.isElevated` is the only new field, and `TallyFixResponse.firewallRule` adds a new variant. Both backwards-compatible.
- No auto-elevation (UAC prompt). The NSIS installer is user-mode per Phase 3 (no elevation manifest); the user manually re-launches as admin when needed. Acceptable v1.0 trade-off.
- The 4 patches were prompted by a real screenshot of a Windows Firewall "Allow" button grayed by org policy on a managed Windows install (different project, but the same UX trap applies to TallyMCP's firewall + tally.ini admin touchpoints).

## v1.0.0-phase3 — NSIS Installer + uninstall hooks + signing (2026-05-26)

### Added
- **`installer/`** new directory with `installer.nsh` (custom NSIS macros — `customUnInstall` invokes the Configurator's no-UI cleanup), `scripts/` (Node helpers: `fetch-node.mjs` downloads pinned Node 20.18.1 portable runtime, `deploy-mcp-server.mjs` runs `pnpm deploy --prod` to stage the MCP server with flat node_modules, `checksum.mjs` writes a `.sha256` sidecar), and `test/` (Windows PowerShell smoke scripts for headless install/uninstall round-trip).
- **`apps/configurator/electron-builder.yml`** — NSIS config: user-mode install (no admin), default install dir `%LOCALAPPDATA%\Programs\TallyMCP\`, `extraFiles` for bundled `node.exe` + staged `mcp-server/`, custom NSH include for the uninstall hook.
- **`apps/configurator/src/main/uninstall-cleanup.ts`** + `--uninstall-cleanup` argv mode in `main/index.ts` — runs the no-UI cleanup before NSIS wipes the install dir: unwires all 5 AI client configs, restores `tally.ini` from `.tallymcp-bak`, removes the Windows Firewall rule (when admin). Wrapped in `app.whenReady().then(...).catch(...)` with `app.exit(0/1)` so NSIS `ExecWait` gets a deterministic exit.
- **`apps/configurator/src/main/install-dir.ts`** — pure `resolveInstallDir()` helper used by `main/index.ts`. In packaged builds it derives the dir from `dirname(app.getPath("exe"))`; in dev it falls back to `%LOCALAPPDATA%\Programs\TallyMCP` (matches electron-builder's user-mode default so wire snippets generated in dev continue to work post-install).
- **Root `pnpm package` script** — orchestrates `pnpm -r build` → `fetch-node` → `deploy-mcp-server` → `electron-builder --win` → `checksum`. Output: `apps/configurator/dist-installer/TallyMCP-Setup-v<version>.exe` + `.sha256`. Plus `pnpm package:install` + `pnpm package:uninstall` for the local smoke scripts.
- **Self-signed code signing** via `electron-builder`'s standard `CSC_LINK` + `CSC_KEY_PASSWORD` env vars. Absent those, the build still produces an unsigned `.exe` with a console warning (useful for engineers without the cert). Setup guide: `docs/v1-installer-phase3-signing-setup.md`.
- **76 unit tests** (existing 69 + 3 new `install-dir.ts` + 4 new `uninstall-cleanup.ts`) + the existing 4 Playwright E2E tests, all green.

### Changed
- `handleWireMcp` args path now points at `<installDir>\mcp-server\dist\main.js` (was `<installDir>\mcp-server\main.js`). This matches `pnpm deploy --prod` output layout — the deploy preserves `dist/main.js`. Existing wired AI clients from earlier dev builds remain functional via the Configurator's H10 hydration → Reconfigure path (just re-Add MCP to refresh).
- Phase 2's `installDir` resolution moved from inline computation to the new `resolveInstallDir()` helper. Production install dir is now `%LOCALAPPDATA%\Programs\TallyMCP\` (was `%LOCALAPPDATA%\TallyMCP\`) — aligns with electron-builder's user-mode default + the `Programs\` convention used by VSCode and other user-mode Electron installers.

### Notes
- Phase 3 ships only the LOCAL installer build. GitHub Actions release pipeline (`release.yml` triggered by `v*.*.*` tag push, signs on `windows-latest`, uploads to GitHub Release, publishes `latest.json`) lands in Phase 4.
- The Phase 2 `auto-update.ts` stub stays untouched; Phase 4 will swap it for real `electron-updater` against the hosted `latest.json`.
- Real installer/app icons are intentionally deferred — Phase 3 uses electron-builder's default Electron logo as a placeholder. Pre-release polish item.
- No EV cert — SmartScreen will still show "Unknown publisher" on first run. Phase 2's `SmartScreenGuide` popup walks users through "More info → Run anyway".

## v1.0.0-phase2 — Configurator UI (Electron) (2026-05-26)

### Added
- **`@tallymcp/configurator`** Electron app — the user-facing UI on top of the Phase 1 libraries. Six screens + one confirmation modal (Home tile grid · Add MCP modal · Health Check · SmartScreen guide · Settings · Done screen · Restore confirmation modal) wired via a typed IPC contract.
- Electron main process owns all Node.js access (`@tallymcp/client-wirer`, `@tallymcp/tally-autofix`); renderer talks to main exclusively through `contextBridge`-exposed `window.tallymcp` API with `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`.
- Background Tally HTTP poller pushes live status to the renderer via `tally-status` IPC events (5 s interval, loopback-only).
- `electron-updater` scaffolded with a stubbed update source — real `latest.json` integration in Phase 4.
- 69 unit tests (main IPC handlers + Zustand store + React components, including `configuredClients` probing, `multipleTallyInstalls` detection, `RestoreConfirmModal`, `DoneScreen`, `ErrorBanner`, App-level error surfacing) + 4 Playwright E2E tests (Electron driver launches the built app, exercises all screens).

### Security
- `wireMcp` IPC handler no longer trusts a renderer-supplied `installDir`. Main resolves the canonical `%LOCALAPPDATA%\TallyMCP` at boot and injects it via `WireMcpContext` when registering the handler. A renderer (or DevTools) caller can no longer point the wire entry at an arbitrary folder. (Cursor review H1, addressed in `f808be9`.)

### Error handling
- All Tally IPC calls (`wireMcp`, `tallyFix`, `tallyRestore`, `healthCheck`) are now wrapped in try/catch in `App.tsx`. Failures surface via a dismissible red `ErrorBanner` rendered between the `StatusBanner` and the active screen. Errors auto-clear on screen navigation and on the next successful operation. (Cursor review M1 + M3.)

### Notes
- Phase 2 ships the UI but NOT the installer packaging (Phase 3), code signing (Phase 3), or the GitHub Actions release pipeline (Phase 4).
- The renderer never persists state to disk — Zustand is in-memory; the canonical config lives in `%LOCALAPPDATA%\TallyMCP\config.json` (managed by the MCP server) and is exposed read-only via `getConfig` IPC.
- Renderer makes exactly one outbound HTTP call: the Tally poll to `http://127.0.0.1:9000` (loopback). No analytics, no auto-update fetch in Phase 2 (Phase 4 wires that).
- Bumped `electron-vite` from `2.x` → `4.x` (resolves the `splitVendorChunk` API removal in Vite 5+); preload bundle pinned to CJS output so the main process's hardcoded `../preload/index.js` path keeps working.

## v1.0.0-phase1 — Installer foundation (2026-05-25)

### Added
- **`@tallymcp/client-wirer`** package — atomic JSON merge / backup / remove for the 5 supported AI clients (Claude Desktop, Cursor, Claude Code, LM Studio, Ollama).
- **`@tallymcp/tally-autofix`** package — `tally.ini` parser/editor that preserves order and comments, Windows Firewall rule manager via `netsh`, Tally process detection.
- **`@tallymcp/cli`** app exposing 4 commands:
  - `tallymcp-cli wire <client>` — adds TallyMCP to the named AI client's config.
  - `tallymcp-cli unwire <client>` — surgically removes our entry.
  - `tallymcp-cli tally-fix` — turns on Tally's XML interface and adds the firewall rule.
  - `tallymcp-cli tally-restore` — restores `tally.ini` from backup and removes the firewall rule.
- `claude-code` added to `apps/mcp-server/src/client-config.ts` SupportedClient list so the runtime config-export tool stays in sync with the installer.

### Notes
- Phase 1 ships only the data-layer libraries and a terminal CLI. The Electron Configurator UI lands in Phase 2.
- JSON config files written by `client-wirer` are formatted with `JSON.stringify(merged, null, 2)`; whitespace and key order may differ from the original. The `.bak` siblings preserve the pre-edit file byte-for-byte for restore.

### Preview-and-confirm UX for CLI commands (Phase 1 addendum)

All 4 CLI commands now print an explicit preview of every file change they will make before modifying anything on disk.  The user must type `y` or `yes` to proceed; any other input (including empty) aborts with exit code 1.

**`-y` / `--yes` flag** — skips the interactive prompt entirely. Intended for scripted environments and for the Phase 2 Configurator UI (which has its own visual consent surface and will pass `--yes` when invoking the CLI).

Behavior summary per command:

| Command | Preview shows | Reversible with |
|---|---|---|
| `wire <client>` | config file path + JSON entry that will be added + backup path | `unwire <client>` |
| `unwire <client>` | config file path + key that will be removed | — |
| `tally-fix` | `tally.ini` path + 2 lines that will be added + firewall rule details | `tally-restore` |
| `tally-restore` | `tally.ini` + backup path that will be restored + firewall rule that will be deleted | — |

The abort path throws an `AbortError` (exported from `apps/cli/src/confirm.ts`); `main.ts` catches it, logs `"Aborted."`, and exits with code 1.  Tests inject a `confirmFn` stub rather than reading from stdin.

### Changed (post-smoke fixes)
- `tally-fix` now skips the Windows Firewall step gracefully when not run as
  Administrator, instead of failing. The `tally.ini` edit still proceeds.
  Most CAs run TallyMCP entirely on loopback (`127.0.0.1:9000`), which does
  not require the firewall rule. Power users with multi-machine setups can
  re-run from an elevated terminal to add it.
- `tally-restore` likewise skips firewall removal gracefully when not run as
  Administrator — `tally.ini` is still restored. The CLI surfaces a clear
  warning with instructions rather than crashing with a stack trace.
- `client-wirer` strips UTF-8 BOM before `JSON.parse` (PowerShell-generated
  config files frequently have one).

## [Unreleased]

### Added

- **v0.7.0 — TDL engine kill-switch:**
  - New `@tallymcp/tdl-engine` package: nunjucks renderer + angular-bracket parameter substitution + F01..Fn row parser + `runTdlReport` orchestrator. Templates are data (`packages/tdl-engine/templates/*.xml` + `report-catalog.json`). 32 Vitest tests.
  - `TallyHttpClient` switched to **UTF-16 LE transport** by default, with per-call `charset?: "utf-16" | "utf-8"` override so legacy UTF-8 envelopes keep working during the migration.
  - `trial-balance.xml` shipped as the first inline-TDL template: `REPORT + FORM + PART + LINE + FIELDs + COLLECTION` over `<TYPE>Ledger</TYPE>` projecting Name / Parent / Opening / Debit / Credit / Closing as F01..F06.
  - `getTrialBalance` connector rewired to delegate through `tdl-engine` while preserving its `TrialBalanceRow[]` return contract. Existing legacy connectors (P&L, BS, masters, day-book, sales, ledger-balance) explicitly request `charset: "utf-8"` until they migrate to TDL in v0.7.1+.
  - C-R1 enforcement: CI test (`packages/tdl-engine/test/c-r1-grep.test.ts`) refuses any template containing Import / Alter / Create / Delete / `MASTER ID` directives.
  - Live proof script: `pnpm v070-tb-proof`. Results captured in `docs/live-tally-checklist.md`.
  - 256 tests passing across all 10 packages.

- **S3 + S4** — `@tallymcp/mcp-server`: stdio MCP server exposing 15 tools (connection, companies, 10 reports, masters/vouchers/dashboard/audit-lite exports, config), 6 prompts (`config`/`read`/`export`/`audit`/`dashboard`/`help`), and 3 resources (`tally://companies`, `tally://docs/connection-guide`, `tally://audit/last`). Network guard restricts egress to the configured Tally host:port (C-R3). Snippet generator emits MCP client config for Claude Desktop, Cursor, LM Studio, and Ollama. 14 Vitest tests including in-process client/server integration.
- **S4 analytics-engine** — `@tallymcp/analytics-engine`: 18 audit-lite check functions (ledger hygiene, GST/PAN format, voucher narrations, duplicate numbers, round-figure / large-journal / backdated, cash negative, suspense balance), `runAuditLite` orchestrator, explainable `computeBooksScore` (0–100), `toAuditWorkbook` Excel renderer, and 3 dashboard builders (ManagementSnapshot, SalesTrend, ExceptionsOverview); 8 Vitest tests including full-sweep and clean-fixture sanity.
- `@tallymcp/shared-types`: `BooksScore`, `BooksScoreComponent`, `AuditLiteSummary`, `AuditLiteResult` schemas
- **S2.2** — `@tallymcp/output-store`: new package wiring `report-engine` + `excel-engine`. `exportReport` (xlsx or json), `exportMasters` (multi-sheet xlsx + per-master CSVs), `exportVouchers` (streaming CSV via new `getDayBookStream`, UTF-8 BOM, RFC-4180 quoting). `GeneratedFile` metadata; safe filename/dir helpers; 8 Vitest tests
- **S2.1** — `@tallymcp/excel-engine`: declarative `WorkbookSpec`/`SheetSpec`/`ColumnSpec` (Zod); `renderWorkbook` via ExcelJS producing `.xlsx` Buffers; Indian currency format presets (`#,##,##0.00`); cover sheet, extraction log, freeze panes, auto-filter; per-report `toWorkbookSpec` adapter covering all 10 in-scope reports; 24 Vitest tests including round-trip per report
- `@tallymcp/shared-types`: `GeneratedFile` + Zod schema. `@tallymcp/report-engine`: `getDayBookStream` async iterable for memory-safe voucher export
- **S1.4** — `@tallymcp/config-store`: `ConfigSchema` (TallyConnection, FinancialYear, `security.readOnly` defaults true per C-R2, `output.folder`, `defaultCompany`, `defaultFinancialYear`); `ConfigStore` with on-disk JSON + Zod validation, in-memory cache, deep-merge `update()`, and `schemaVersion` migration stub; 17 Vitest tests
- **S1.3** — `@tallymcp/report-engine`: 10 report connectors (companies, company-info, ledgers, groups, voucher-types, day-book, trial-balance, P&L, balance-sheet, sales-register); `resolvePeriod` (Indian FY defaulting from `Company.startingFrom`); 7-day chunked Day Book reader; `runReport` dispatcher (Zod-validated request, typed `ReadReportResult`); `TallyReportError` for soft `<LINEERROR>` responses; 48 Vitest tests, **89.8 %** package coverage; `scripts/read-report.ts` live-test CLI
- **`@tallymcp/shared-types`** extensions: `VoucherLine`, `Voucher` (with `party`/`reference`/`entries`), `TrialBalanceRow`, `PnlRow`, `BalanceSheetRow`, `ReportId` enum, `ReadReportRequest`, `ReadReportResult`, `ReportStatus`, `ReportMeta`, `Finding`, `FindingSeverity`; 22 new Vitest tests
- **S1.2** — `@tallymcp/tally-xml` XML response parser: `parseTallyResponse` (fast-xml-parser, UTF-8/entity-safe, no-prolog tolerant), `walk`/`findAll` tree helpers, `extractLineErrors`, `parseTallyAmount` (Indian lakh grouping + Cr/Dr), `parseTallyBoolean`; `TallyXmlError`/`TallyAmountParseError`; 45 Vitest tests; `@vitest/coverage-v8` added for the coverage gate
- **S1.1** — `@tallymcp/tally-xml` Export Data envelope builder: `buildExportEnvelope` + 10 per-report envelope helpers (List of Companies, Company Info, Ledgers, Groups, Voucher Types, Day Book, Trial Balance, P&L, Balance Sheet, Sales Register); UTF-8 export vars and XML escaping on every envelope; 17 Vitest tests

### Changed

- Repository scoped to source code and developer docs; internal business-requirements and implementation-plan documents are maintained privately.

## [0.0.1] — 2026-05-21

### Added

- Phase 0 monorepo bootstrap (pnpm workspace, TypeScript strict, ESLint, Prettier, Vitest, CI)
- `@tallymcp/shared-types` — core Zod domain schemas
- `@tallymcp/tally-xml` — XML escape/date helpers with tests
- `@tallymcp/tally-connector` — Tally HTTP client, request serializer, diagnostics
- Tally XML sample fixtures and `scripts/hello-tally.ts`
