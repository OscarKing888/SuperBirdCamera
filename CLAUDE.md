# SuperBirdCamera - Claude Coordination

This repository keeps repo-wide Claude guidance in this file and path-scoped
details under `.claude/rules/`. Full shared policies live in `.codex/rules/`;
Claude adapters only point there.

## Active Scopes

- `**` (feature Git workflow): `.claude/rules/feature-branch-merge.md`
- Product and collaboration map: `AGENTS.md`

## Shared Expectations

- Never write machine-specific absolute paths, usernames, or personal IDE
  settings into instructions, rules, skills, or docs.
- Before feature edits, follow `.codex/rules/feature-branch-merge.md`.
