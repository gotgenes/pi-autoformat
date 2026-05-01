---
description: Execute the TDD steps from a docs/plans/ plan as red→green→commit cycles
---
# Execute a plan with TDD

Argument: `$1` is either a plan path, an issue number, or empty (use the most recently modified plan).

## Locate the plan

- If `$1` looks like a path, use it.
- If `$1` is a number, find `docs/plans/NNNN-*.md` matching that integer (issue number or plan number).
- Otherwise, use the newest file in `docs/plans/` (by mtime).

Read the plan in full before doing anything else. If "TDD Order" is missing or empty, stop and report — re-run `/plan-issue` first.

## Read project rules

Read `AGENTS.md`. The relevant rules for this template:

- TypeScript only; avoid `any`.
- Conventional Commits; commit at meaningful checkpoints.
- Don't remove functionality without explicit user discussion.
- Keep `schemas/`, `docs/configuration.md`, `README.md`, and the config loader aligned when any one of them changes.

## Execute the TDD cycle

For **each** step in the plan's "TDD Order", in order:

1. **Red.** Write the failing tests the step describes. Run only the affected test file:
   `pnpm exec vitest run <test-path>` and confirm failures.
2. **Green.** Implement the minimum code to make those tests pass. Re-run the same file and confirm green.
3. **Commit.** Use the commit message the plan suggests, or a Conventional Commits message that matches:
   - `test:` for test-only commits (rare; usually folded into the feat).
   - `feat:` for new behavior.
   - `feat!:` for breaking changes the plan calls out (include a `BREAKING CHANGE:` footer).
   - `fix:` for bug fixes.

One logical change per commit. Do not bundle multiple TDD steps into one commit.

If a step uncovers a problem the plan didn't anticipate (e.g. a downstream test breaks), fix it as part of the same commit and note the deviation in the commit body. If the deviation is large, stop and ask.

## After the last TDD step

1. Run the full suite: `pnpm exec vitest run`. Must be all green.
2. Run the linter: `pnpm run lint`. If it fails, run `pnpm run lint:fix` and re-check. Commit any fixup as part of the most recent feat commit (amend) only if you haven't pushed; otherwise as a `style:` commit.
3. Update docs the plan flags: `README.md`, `docs/configuration.md`, schemas, etc. Commit as `docs: <summary>`.
4. **Do not edit `CHANGELOG.md`** — release-please owns it and will generate entries from your Conventional Commit messages on the next release.

## Summarize

Print:

- `git log --oneline <N>` for the commits you just made (N = number of TDD steps + docs).
- One-line summary of behavioral change.
- Any test-count delta.
- Any deviations from the plan.

Stop. The next step is `/ship-issue`.
