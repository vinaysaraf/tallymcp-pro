# Definition of Done

Every milestone must pass this checklist before it is closed.

- [ ] Zod schemas exist for all public inputs/outputs.
- [ ] Vitest tests written; coverage >= 80% on the milestone's package.
- [ ] No `any`, no `as` casts without a comment justifying them.
- [ ] Public errors extend a typed base class (`TallyConnectionError`, `TallyXmlError`, etc.).
- [ ] User-facing error messages are CA-friendly (no stack traces leaked through MCP).
- [ ] If the milestone touches `/write`, the C1 and C2 guards in plan §1.2 are exercised by a test.
- [ ] CA advisor has reviewed any milestone tagged "CA review".
- [ ] CHANGELOG.md updated.
