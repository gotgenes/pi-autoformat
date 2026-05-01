---
description: Push, close a GitHub issue with a summary, and merge the release-please PR
---
# Ship the implementation

Argument: `$1` is the issue number that was just implemented.

## 1. Push

- Determine the current branch (`git branch --show-current`).
- `git push origin HEAD` (or `<branch>:<branch>`).
- If the push is rejected as non-fast-forward, stop and report — do not force-push.

## 2. Verify CI on the pushed commit

- Run `gh run list --branch <branch> --limit 3` and find the run for the latest commit (`git rev-parse HEAD`).
- If the latest run is `in_progress` or `queued`, wait (`sleep 15`) and re-check up to ~3 times.
- If it lands `failure`, stop and report. Do not close the issue or merge anything.
- If it lands `success`, continue.

## 3. Close the issue

Build the close comment from the commits since the previous release:

```bash
git log --oneline <previous-tag-or-base>..HEAD
```

The comment should include:

- The commit hash that lands the change ("Implemented in `<sha>` …").
- A short bullet list of feature/breaking commits.
- One sentence on user-visible behavior change.
- A note flagging any breaking change (matches `feat!:` commits).
- If the change unblocks or partially addresses other issues, mention them.

Then:

```bash
gh issue close $1 --comment "<the summary above>"
```

## 4. Merge release-please PR (if present)

- `gh pr list --search "release-please" --state open` — find an open release PR for `main`.
- If none exists, skip to step 5.
- If one exists:
  - `gh pr view <num> --json mergeable,mergeStateStatus,title` — confirm `MERGEABLE` and `CLEAN`.
  - Note: release-please PRs typically have **no CI runs** because PRs created by the default `GITHUB_TOKEN` do not trigger workflows. This is expected; do not block on it.
  - `gh pr merge <num> --rebase`.
  - `git pull --ff-only` to pick up the release commit and any tag.

If the release-please PR is in any state other than `CLEAN`/`MERGEABLE`, stop and report — let the user decide.

## 5. Final report

Print:

- The new HEAD on `main` (`git log --oneline -1`).
- The released version, if a release commit just landed (`git tag --points-at HEAD` or read `package.json`).
- Issue close confirmation.
- Anything that was skipped and why.

## Constraints

- Never force-push.
- Never merge a release-please PR that is not `MERGEABLE`/`CLEAN`.
- If CI fails, the issue stays open.
- If multiple release-please PRs exist for the same component, stop and ask — that's a configuration issue, not a normal merge.
