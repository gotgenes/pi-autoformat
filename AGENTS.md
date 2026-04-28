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
- Format only files touched by the agent, not the whole repository.
- Make formatter failures visible, but do not block the original file edit by default.

## Code Style

- Use TypeScript.
- Avoid `any` unless absolutely necessary.
- Use standard top-level imports only.
- Keep modules focused and composable.
- Prefer explicit configuration over hidden behavior.

## Testing

- Add focused tests for formatter resolution, execution order, and failure handling.
- Test prompt-end batching behavior.
- Test custom formatter command configuration.
- Test multiple formatter chains for the same file type.

## Commits

- Use Conventional Commits.
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

Do not assume commit-time hooks are an acceptable primary formatting mechanism.
