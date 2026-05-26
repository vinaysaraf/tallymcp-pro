# AI Review Workflow

This folder is the **handoff surface between Claude (in Claude Code) and Cursor** when an independent code review is wanted.

## How it works

After Claude finishes a chunk of work, it offers two choices:

1. **Approve** — Claude treats the work as final and proceeds (commit, push, next task).
2. **Review from Cursor** — Claude pauses and shares a short prompt naming the files to review. You paste that prompt into Cursor's chat (with this repo open). Cursor reads `.cursor/rules/tallymcp-review.mdc` for context and review style, then writes its findings to **`ai-review/Cursor_review.md`** in this folder.

Once Cursor has written `Cursor_review.md`, tell Claude "done" and Claude will read the file, address any blockers, and report back.

## Why this works

- **One canonical review file** (`Cursor_review.md`) — always overwritten with the latest review. No date-stamping, no clutter.
- **Project context lives in the Cursor rule**, not in every prompt. Cursor automatically loads `.cursor/rules/tallymcp-review.mdc` so the prompt you paste can stay tiny — just file paths.
- **Tracked in git** so the Cursor rule and review history are portable across machines.

## What's NOT in this folder

- Claude's own internal review notes (those stay in conversation context).
- Subagent reviews from Claude's `subagent-driven-development` workflow (those happen inline per task and aren't persisted).
- Per-task spec/quality reviews — those are already done by the time you see "Approve / Review from Cursor".

This folder is exclusively for **independent second-opinion reviews from Cursor**, run on completed work.
