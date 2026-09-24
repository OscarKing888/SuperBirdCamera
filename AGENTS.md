# SuperBirdCamera Repository Collaboration Map

This file holds repository-wide guidance for AI coding agents. Keep
product-specific rules here as the project grows; do not copy the same rule
into multiple adapter files.

## Feature Git workflow

Before feature edits, follow `.codex/rules/feature-branch-merge.md` for session
worktrees, focused verification, commits, conflict resolution by feature
intent, automatic local `main` merge, and temporary branch cleanup. Claude and
Cursor adapters only point at that file; do not copy the full policy elsewhere.

## Repo-Wide Rules

- Never write machine-specific absolute paths, usernames, or IDE-local setup
  into collaboration docs, skills, rules, scripts, or generated guidance.
- Keep code, focused tests, and relevant docs aligned with each change.
- Prefer relative paths or semantic descriptions such as `repository root`.

## Supporting Materials

- Feature branch / merge protocol: `.codex/rules/feature-branch-merge.md`
