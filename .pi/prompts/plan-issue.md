---
description: Read a GitHub issue, gather context, and write a numbered plan to docs/plans/
---
# Plan a GitHub issue

Issue number: `$1`

Your job is to produce a numbered implementation plan at `docs/plans/NNNN-<slug>.md` for issue #$1, then commit it. Stop after the commit. Do **not** start implementation — the next step is `/tdd-plan`.

## Gather context (do this first, in parallel where possible)

1. Run `gh issue view $1` to read the issue body and labels.
2. Read `AGENTS.md` for project priorities, constraints, and code-style rules. Honor them in the plan.
3. List `docs/plans/` to see numbering and style conventions. Pick the next free `NNNN` (prefer matching the issue number when reasonable).
4. Read every issue the body references as a prerequisite or related (`gh issue view <n>`). Note whether each is implemented yet — your plan must say what it depends on vs. defers.
5. Open the source files most relevant to the change and skim them before writing.

## Decide

Before writing the plan, identify any genuinely ambiguous design choices. If there are 1–2 such choices (breaking-vs-non-breaking, result-shape change, fallback semantics, etc.), use the `ask-user` skill once to surface them with a short context summary and concrete options. Skip this step if the issue's "Proposed change" section is unambiguous.

## Write the plan

File: `docs/plans/NNNN-<short-slug>.md`. Sections, in this order:

- **Problem Statement** — quote the issue's framing in your own words.
- **Goals** — bullet list, scoped to this change.
- **Non-Goals** — explicitly defer anything tangential (sibling issues, follow-ups).
- **Background** — relevant existing modules/functions and how they relate.
- **Design Overview** — dispatch model, data shapes, separation of concerns, edge cases. Include code-fenced TS types when shape changes.
- **Module-Level Changes** — file-by-file list of what's added, changed, or removed.
- **TDD Order** — numbered red→green→commit cycles. Each item names the test surface, what's covered, and the suggested commit message (`test:`, `feat:`, `feat!:`, `docs:`).
- **Risks and Mitigations** — concrete risks and how the plan addresses each.
- **Open Questions** — defer-until-needed items.

If the change is breaking, say so explicitly in Goals and use `feat!:` in the suggested commit messages.

## Commit

```bash
git add docs/plans/NNNN-*.md
git commit -m "docs: plan <short summary> (#$1)"
```

Then print a 5-line summary of the plan's key decisions and stop.
