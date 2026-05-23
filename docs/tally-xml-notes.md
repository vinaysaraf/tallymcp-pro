# Tally XML Protocol Notes

Captured during Phase 0 bootstrap. Canonical envelope format lives in
`packages/tally-xml` (`buildExportEnvelope`) and the `samples/*.request.xml` fixtures.
Use UTF-8 export variables on every request.

## Documented quirks

1. **No XML prolog** — Tally often omits `<?xml version="1.0"?>` in responses.
2. **Entity encoding** — Responses may double-encode `&amp;`; use `fast-xml-parser` with `processEntities: true` and `htmlEntities: true`.
3. **Default encoding** — Tally defaults to ISO-8859-1; always request UTF-8 via `<SVEXPORTFORMAT>` and `<ENCODINGTYPE>`.
4. **Date format** — All dates are `YYYYMMDD` strings, not ISO 8601.
5. **Amount sign** — Debit/credit interpretation depends on `ISDEEMEDPOSITIVE` on the ledger line.
6. **Company name in requests** — Use exact company name as shown in List of Companies (often prefixed with numeric ID).
7. **Ampersands in party names** — Must be escaped in request envelopes (`&amp;`).
8. **Alterations** — Voucher/master alterations require `TAGNAME="MASTER ID"` (space mandatory); see v2.1 Errata E5.
9. **IMPORT responses** — Check `<ERRORS>`, `<LINEERROR>`, and `<CREATED>` / `<ALTERED>` counts.
10. **Connection** — Default local XML port is 9000; Tally must have Client/Server set to Both.

## Sample fixtures

Real request/response pairs live under `samples/`. Replace response fixtures with
captures from your TallyPrime instance during M0.4 acceptance.

## Hello-world test

**Mac (no local Tally):**

```bash
pnpm hello-tally:fixture
```

**Windows (local Tally) or Mac → LAN Windows host:**

```bash
pnpm hello-tally
# Mac with remote Tally:
TALLY_HOST=192.168.1.50 pnpm hello-tally
```

See `docs/mac-dev-setup.md` for Mac developer workflow.
