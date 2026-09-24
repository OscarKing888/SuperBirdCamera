# Feature Branch, Merge, and Cleanup

Repository-wide Git protocol for feature work. Keep the full policy in this
file. Codex, Claude, and Cursor adapters only point here.

## Session start: isolated worktree and branch

- Before the first edit to code, tests, config, or docs in a session, create an
  isolated Git worktree and a unique task branch from the latest committed
  local `main`. Default branch name: `session/<task>-<short-random-id>`.
  Default worktree path: `.worktrees/<task>-<short-random-id>/` under the main
  repository. Read-only analysis does not require a worktree. When resuming the
  same session, reuse the worktree and branch already confirmed for this
  session. If a tool already created an isolated worktree, use it, but create a
  task branch first when HEAD is detached. Do not develop in the main working
  tree, and do not create a branch while continuing to share the same working
  directory.
- At start, run `git status --short --branch`, `git worktree list --porcelain`,
  and `git rev-parse main`. Record the main repository path, task worktree
  path, branch name, and starting commit. Create with
  `git worktree add -b <branch> <worktree-path> <main-commit>`; replace every
  placeholder with real values for this session. Uncommitted or untracked
  changes already present in the main tree are not carried in. Do not stash,
  clean, or commit work belonging to other sessions.
- All subsequent reads, writes, dependency setup, and verification must use this
  session worktree as the working directory. Do not assume one `cd` persists
  across later tool calls. Keep caches, service ports, test output, and local
  runtime data from colliding across concurrent sessions. Do not copy mutable
  runtime data from the main tree into commits.
- Subagents in the same session may share this worktree when edit ranges are
  explicitly disjoint. The parent agent alone stages, commits, and merges.
  Subagents must not switch branches or update `main`. Independent sessions must
  not share a task worktree.

## Feature complete: verify and commit

- Run focused verification for the affected change only. Prefer checks already
  documented in the repository root `AGENTS.md`, or the stack present in the
  change set (for example `go test ./...` / `go build ./...` when Go packages
  exist). Cross-scope changes run the union of the relevant checks. Do not
  default to an unrelated full-repository suite. If no automated checks yet
  apply, say so explicitly; do not invent a pass.
- After each independent feature addition, change, or fix passes its focused
  verification, create one Git commit on the task branch immediately. Do not
  ask again whether to commit. Do not batch several finished features into one
  late commit.
- Keep the code, focused tests, and docs for one feature in the same commit.
  Stage by explicit paths or hunks. Review the staged diff before committing.
  Do not include unrelated work or other sessions' uncommitted changes. Do not
  run a blanket stage from the shared main tree. Write a commit message that
  clearly describes the feature change.
- Report the actual scopes, commands, and results that ran. Do not describe a
  partial pass as a full-repository pass.

## Session complete: resolve conflicts and merge to main

- After the session work is committed, merge into local `main` automatically.
  Do not ask again whether to merge, and do not ask before resolving ordinary
  code conflicts. This authorization does not include automatic push. First
  merge the latest `main` commit into the task worktree with
  `git merge --no-edit <main-commit>`. Resolve every conflict on the task
  branch, never in the main working tree.
- When resolving conflicts, read the merge base, both sides, related callers,
  and tests. Keep every still-applicable feature intent and interface contract
  from both sides, then complete the merge commit. Do not always choose
  `ours`/`theirs`, overwrite whole files, delete the other side's features, or
  delete tests / weaken assertions to force a pass. Stop and report only when
  the repository and the user request cannot decide a business trade-off, when
  data cannot be preserved, or when breakage cannot be ruled out. Ordinary text
  and decidable logic conflicts must be resolved without asking.
- If syncing `main` or resolving conflicts changed the deliverable, re-run the
  focused verification for the final change set. Do not treat pre-sync results
  as post-merge verification. Confirm there are no unresolved conflicts and the
  task worktree is clean. Record the verified task commit and the corresponding
  `main` tip. If verification fails, keep fixing; do not advance `main`.
- Every session that updates `main` must use the same repository-level merge
  lock: resolve `git rev-parse --git-common-dir` to an absolute directory
  relative to the current worktree, then use `superbird-main-merge.lock/`
  inside that directory as the lock directory. Acquire the lock by atomic
  directory create. One long-lived process owns create, verify, fast-forward,
  and `finally` release, and records that process PID, this session id, time,
  and task branch. Do not treat an already-exited short-lived process PID as
  the lock holder. If the lock exists, wait and retry; do not seize it. Recover
  a stale lock only when the former holder process is confirmed dead and no
  merge is in progress; do not delete a lock merely because it is old.
- After acquiring the lock, re-check the `main` tip, its worktree path, and its
  status. If `main` differs from the verified baseline, release the lock, return
  to the task branch, re-sync, resolve, verify, and re-acquire the lock. Do not
  skip commits another session just merged. The lock covers only final verify,
  fast-forward, and task-branch deletion; it does not cover development, tests,
  or worktree file cleanup. On finish or failure, release only the lock this
  session holds.
- In the `main` worktree confirmed by `git worktree list --porcelain`, run
  `git merge --ff-only --no-overwrite-ignore <verified-task-commit>`. Do not
  force-update refs, `reset --hard`, or force-checkout. If `main` is not checked
  out anywhere, create a dedicated merge worktree while holding the lock. Do not
  force multiple worktrees to check out `main` at once.
- When the main tree has uncommitted changes, first confirm the index has no
  staged content, no merge/rebase is in progress, and the fast-forward paths do
  not overlap unstaged, untracked, or ignored existing files; also check
  case-folding and parent/child path collisions on the target filesystem.
  Ordinary `git status` omits ignored files and is not enough by itself. Allow
  only a normal Git fast-forward that leaves those unrelated changes intact. If
  there is staged content, path overlap, or Git refuses the merge, release the
  lock and retry after the obstruction clears. Do not stash, overwrite, restore,
  or commit other people's work, and do not bypass protection by only moving the
  `main` pointer. If blocked, keep this session's committed branch and report
  the blockage honestly; do not claim the merge succeeded.
- After the merge, confirm the task commit is contained in `main`, that other
  main-tree changes remain, and report the task branch, feature commits, the
  new `main` commit, verification results, and any conflict handling. Then run
  the local temporary-resource cleanup below.
- Paths and commands must work on macOS and Windows x64: use short directory
  names and quote paths that contain spaces. Automate Git with argument arrays
  and `shell=false`. Acquire the lock with cross-platform atomic directory
  create; do not depend on Unix-only `flock`. Keep Chinese docs and comments in
  UTF-8 when present.

## After merge: clean up local temporary branches

- Session task branches and worktrees are local temporary resources by default.
  After the task is verified and merged into `main`, clean up this session's
  worktree and task branch automatically. Do not ask again, and do not keep the
  branch long-term as a backup. Commits already in `main` history remain
  reachable by commit id after the temporary branch name is deleted.
- Do not automatically push the session task branch or set a remote upstream.
  Do not publish it indirectly via `git push --all`, `git push --mirror`, or a
  wildcard refspec. Push a named branch only when the user explicitly asks for
  remote collaboration, a PR, or a backup. Pushing `main` still requires
  explicit user authorization; local merge and cleanup do not imply publish
  authorization. Do not change the user's global Git config to run this
  protocol, and do not delete remote branches automatically.
- Cleanup applies only to the exact branch name and worktree path recorded for
  this session. First confirm this session's agents, services, and test
  processes have exited, the worktree is not locked or occupied, and the task
  branch tip is still the verified merged commit. Then run
  `git merge-base --is-ancestor <branch> main` and treat exit code `0` as fully
  merged. Do not bulk-delete other sessions' resources by branch name, directory
  name, age, or `git branch --merged` alone.
- Before removing the worktree, inspect tracked changes, all untracked files,
  and ignored files; `git status --short --untracked-files=all --ignored` helps.
  Discard only confirmed session caches and test temporaries. Preserve
  uncommitted work product, local databases, config, deliverable logs, and
  unknown-purpose files per existing directory rules; otherwise keep the
  worktree and branch and report why. A clean Git status does not replace this
  check.
- When safe, from the main worktree run `git worktree remove <worktree-path>`.
  After that succeeds, acquire the repository merge lock again, re-check that
  the branch tip is unchanged, still contained in current `main`, and not
  checked out in any worktree, then in the `main` worktree run
  `git branch -d <branch>` and release the lock. `-d` may consult upstream
  merge state and does not replace the explicit `main` ancestor check. If
  deletion is refused, keep the branch; do not switch to `-D`.
- If any step finds unmerged commits, moved refs, uncommitted content,
  occupancy, or cleanup failure, keep the remaining resources and report the
  branch, path, and reason. The completed merge conclusion stands. Do not use
  `--force`, `git clean -fdx`, recursive directory deletes, or forced ref
  deletion to bypass protection. Report cleanup results on delivery. Later
  edits start a new task branch from the latest `main`.
