# AGENTS.md

## Project Purpose

This repository is for a Pi extension that auto-formats files after agent edits so formatting does not fail late at commit time.

Read `docs/plans/` before making architectural changes.

## Workflow

- Keep scope tight.
- Prefer small, reversible changes.
- Preserve intentional behavior unless there is a clear reason to change it.
- Ask before removing functionality or changing defaults.

## Implementation Priorities

- Prefer prompt-end formatting over immediate per-tool formatting unless the task explicitly requires otherwise.
- Favor repository-configured formatter commands over hardcoded formatter behavior.
- Prefer extension-owned config files over Pi `settings.json` keys for package-specific behavior.
- Format only files touched by the agent, not the whole repository.
- Make formatter failures visible, but do not block the original file edit by default.
- When a config pattern or documented recommendation can solve a problem, prefer that over a new runtime mechanism.
  Mechanism is forever; docs are reversible.
- Trust formatters to discover their own project configs (most walk up the directory tree natively).
  Do not reimplement formatter-side config resolution inside this extension.

## Code Style

- Use TypeScript.
- Avoid `any` unless absolutely necessary.
- Use standard top-level imports only.
- Keep modules focused and composable.
- Prefer explicit configuration over hidden behavior.
- Treat any declared config field not read by the dispatcher as a maintenance trap.
  Remove it or document its purpose.

## Markdown

- Use one sentence per line (unbroken) for better diffs.
- Always specify a language on fenced code blocks (e.g., ` ```typescript `, ` ```bash `, ` ```text `); use `text` for plain output that has no specific syntax.
- Use sequential numbering (`1.` `2.` `3.`) in ordered lists, restarting at `1.` under each new heading — markdownlint's MD029 rejects continued numbering across section boundaries.
- Do not use bold text (`**...**`) as a substitute for headings — use proper Markdown heading syntax (`##`, `###`, `####`); markdownlint's MD036 rejects emphasis used as headings.
- When embedding markdown content that itself contains fenced code blocks, use a 4-backtick outer fence (` ````markdown `) so inner 3-backtick fences render correctly.

## Configuration

- Use extension-owned config files:
  - global: `~/.pi/agent/extensions/pi-autoformat/config.json`
  - project: `.pi/extensions/pi-autoformat/config.json`
- Project config overrides global config.
- Do not move package configuration into Pi `settings.json` without explicit discussion.
- Keep `schemas/pi-autoformat.schema.json`, `docs/configuration.md`, `README.md`, and the TypeScript config loader aligned.
- When removing a previously accepted config field, keep the loader tolerant: accept the legacy key, emit a single non-fatal config issue per occurrence describing the deprecation, and discard the value.
  Drop the field from the TypeScript types, the JSON schema, and the docs in the same change.
  This avoids breaking on-disk configs while still surfacing the trap.

## Documentation frontmatter

Docs under `docs/plans/` and `docs/retro/` use YAML frontmatter for structured metadata.
GitHub renders it as a table at the top of the file.

Schema (both fields are strings/numbers — quote any title containing backticks or colons):

```yaml
---
issue: 14                                              # optional: omit for plans that predate issue tracking
issue_title: "Batch-by-default formatter dispatch"     # required
---
```

- `issue` stores the number only, never a URL.
- Do not duplicate frontmatter fields as inline metadata in the body (e.g. `Issue #N` in the H1 is fine; a separate `**Issue:** #N` line is not).
- Other doc types (`docs/configuration.md`, `README.md`) do not use frontmatter.

## Testing

- Add focused tests for formatter resolution, execution order, and failure handling.
- Test prompt-end batching behavior.
- Test custom formatter command configuration.
- Test multiple formatter chains for the same file type.
- Add focused tests for config loading, merge precedence, and validation issues.
- Add extension lifecycle tests once the runtime entrypoint exists.
- Vitest uses esbuild and does not typecheck.
  Run `pnpm run typecheck` for type-only changes (red/green via `tsc --noEmit`).
- Do not insert no-op statements (`void 0;`, unused locals) in tests just to make an `Edit` tool's `oldText` unique — widen `oldText` with surrounding context instead.

## Commits

- Use Conventional Commits.
- Commit at meaningful checkpoints without waiting for an explicit reminder.
- Prefer small, reviewable commits that leave the repository in a valid state.
- Examples:
  - `feat: add prompt-end formatter queue`
  - `fix: preserve formatter order for markdown chains`
  - `test: cover custom formatter override`
  - `docs: refine initial implementation plan`

## Notes for Agents

Before implementing, understand:

1. the problem being solved
2. the timing tradeoffs between tool-mode and prompt-mode formatting
3. the need to support repository-specific formatter chains
4. the chosen config layout and merge precedence
5. the need to keep schema, config loader, and docs aligned

Do not assume commit-time hooks are an acceptable primary formatting mechanism.
