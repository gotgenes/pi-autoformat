# Pi Autoformat: Initial Implementation Plan

## Problem Statement

Pi agents frequently modify files that later fail commit-time hooks because formatting was not run after editing. This is especially painful for formatters that mutate files, such as Prettier and Markdown lint fixers.

In practice, this creates a bad workflow:

1. The agent edits files.
2. The agent believes the task is complete.
3. A commit or pre-commit hook runs later and mutates files.
4. The commit fails because files changed during commit validation.
5. The agent must recover from late, out-of-band file mutations.

This is made worse in repositories that use `prek` for pre-commit hooks, because `prek` does not automatically re-stage files after fixer commands mutate them.

The goal of this repository is to provide a Pi-native auto-formatting solution that runs *before* commit time, so agents do not need to remember formatter commands and do not get surprised by late formatting changes.

## Desired Outcome

A Pi extension that:

- automatically formats files changed by the agent
- reduces or eliminates commit failures caused only by missing formatting
- works with project-specific formatter commands
- defaults to a timing model that is safe for Pi's edit workflow
- makes formatter failures visible without blocking normal editing

## Prior Research Summary

### Pi extension capabilities relevant to this problem

Pi already exposes the mechanisms needed to implement this as an extension.

Useful extension hooks and features:

- tool lifecycle hooks such as `tool_result`
- turn/agent lifecycle hooks such as `turn_end` / `agent_end`
- built-in tool override support
- project-local extensions in `.pi/extensions/`
- per-file mutation coordination via `withFileMutationQueue()`

Important implementation observation:

- formatting immediately after every `write`/`edit` is possible
- but it can create follow-up edit failures if formatting changes the file before later exact-text edits operate on it

That makes deferred formatting after the agent finishes a prompt materially safer than immediate per-tool formatting.

### Findings from `tenzir/pi-formatter`

`pi-formatter` is close to the needed solution and validates the general approach.

What it does well:

- hooks successful `write` and `edit` tool results
- supports multiple timing modes: `tool`, `prompt`, `session`
- defaults to `prompt`, which is safer than `tool`
- keeps formatter failures non-blocking
- provides TUI summaries for formatter results

Important gaps:

- only covers Pi `write` and `edit`, not arbitrary file mutations from `bash` or custom mutating tools
- built-in formatter set is opinionated
- does not directly model "run the exact formatter chain this repository already wants"
- does not specifically support `markdownlint-cli2` out of the box

Key design takeaway:

- deferred formatting after the agent finishes a prompt is the correct default timing model for Pi

### Findings from OpenCode's built-in formatter system

OpenCode solves several problems better than `pi-formatter`.

What OpenCode does well:

- formatting is built into core mutation tools, not just an add-on hook
- it formats from `write`, `edit`, and `apply_patch`
- it supports a config-driven formatter registry
- custom formatters can define:
  - command
  - environment
  - file extensions
- multiple matching formatters can run sequentially for the same file
- built-in coverage is broad
- formatter definitions are project-oriented rather than hardcoded to a small fixed tool set

Important remaining gaps in OpenCode:

- formatting still happens immediately after individual tool calls
- that eager timing can still create stale-file drift for later edits
- it still does not automatically cover arbitrary shell-driven file mutations
- formatter failures are logged, but reporting is less explicit than `pi-formatter`

Key design takeaway:

- OpenCode's formatter registry/config model is worth borrowing
- OpenCode's immediate execution timing is *not* the best default for Pi

## Design Direction

The recommended architecture is a hybrid of the best ideas from both systems:

- use a Pi extension
- use a config-driven formatter registry inspired by OpenCode
- default formatting timing to end-of-prompt, inspired by `pi-formatter`
- optionally support end-of-session and immediate-per-tool modes
- add clearer support for repository-specific formatter commands and formatter chains

## Proposed Scope

### In scope

- project-local or globally installable Pi extension
- automatic formatting for files touched by Pi's built-in mutation tools
- configurable formatter registry
- support for custom formatter commands
- support for multiple formatters per file type in declared order
- visible summaries or warnings for formatter success/failure
- default safe timing mode for Pi agents

### Out of scope for the first version

- perfect detection of every file mutated by arbitrary shell commands
- automatic staging or commit orchestration
- replacing existing pre-commit hooks
- whole-repository formatting after every response

## Core Product Decisions

### 1. Default timing mode

Default to formatting once after the agent finishes a prompt.

Rationale:

- safer for Pi's edit workflow than formatting after every tool call
- avoids mutating a file between sibling edits in the same assistant run
- still happens early enough to prevent most commit-time failures

Optional modes can be added later:

- `tool`: format immediately after each successful mutation tool
- `prompt`: format once after agent work completes for the prompt
- `session`: accumulate touched files and format on session shutdown

### 2. Formatter model

Use a configurable formatter registry.

Each formatter entry should be able to specify at least:

- `command: string[]`
- `environment?: Record<string, string>`
- `extensions: string[]`
- `disabled?: boolean`

Likely additions beyond OpenCode:

- explicit `order` or ordered array semantics
- optional `when` or config-detection behavior for built-ins
- optional `mode` for chain behavior, e.g. `all` vs `first-success` vs `fallback`

### 3. Formatter chain behavior

Support multiple formatters for the same file type in explicit order.

This matters for repositories that want things like:

- `prettier --write`
- `markdownlint-cli2 --fix`

or other repo-specific chains.

Do not rely on object insertion order alone if avoidable.

### 4. Failure behavior

Formatter failures should not block the original edit/write result by default.

However, failures should be surfaced clearly:

- TUI summary lines when interactive
- warning text or logs when non-interactive
- clear indication of which file and formatter failed

### 5. File coverage strategy

Initial implementation should cover at least:

- `write`
- `edit`

Potential next step:

- support additional mutation tools, if present
- add optional touched-file collection for custom tools
- evaluate whether shell-driven file mutation support is practical without introducing too much complexity or noise

## Suggested Configuration Shape

Example draft only:

```json
{
  "formatMode": "prompt",
  "hideSummariesInTui": false,
  "formatters": {
    "prettier": {
      "command": ["prettier", "--write", "$FILE"],
      "extensions": [".js", ".ts", ".tsx", ".json", ".md"]
    },
    "markdownlint-cli2": {
      "command": ["markdownlint-cli2", "--fix", "$FILE"],
      "extensions": [".md"]
    }
  },
  "chains": {
    ".md": ["prettier", "markdownlint-cli2"],
    ".ts": ["prettier"]
  }
}
```

Notes:

- `$FILE` substitution is simple and proven
- a separate `chains` section may be clearer than relying only on formatter extension overlap
- built-in formatters can exist, but project config should be able to override them cleanly

## Implementation Plan

### Phase 1: repository and extension skeleton

- create package skeleton for a Pi extension
- define config file location and schema
- add minimal extension entry point
- add a small README once implementation starts

### Phase 2: touched-file collection and flush timing

- watch successful `write` and `edit` tool results
- resolve and normalize file paths
- collect touched files during the current prompt
- flush formatting at prompt end
- serialize formatting operations per file

### Phase 3: formatter registry

- implement built-in formatter definitions
- implement custom formatter config parsing
- resolve enabled formatters for a file
- substitute `$FILE`
- execute configured commands with optional environment overrides

### Phase 4: formatter chain execution

- support ordered execution for multiple formatters per extension/path kind
- define chain behavior explicitly
- capture per-run success/failure summaries

### Phase 5: reporting

- interactive summaries in the TUI
- warning logs outside the TUI
- concise file-level reporting

### Phase 6: tests

At minimum, test:

- no formatter configured => no-op
- prompt-mode batching
- sequential formatter chains for one file
- custom formatter command overrides
- formatter failure reporting without blocking edits
- deduping touched files within the same prompt
- path normalization and scope handling

### Phase 7: optional enhancements

- session mode
- tool mode
- support for more mutation tools
- optional shell mutation integration strategy
- optional settings command / config editor UI

## Risks and Mitigations

### Risk: formatting changes break later exact edits

Mitigation:

- default to prompt-end formatting, not per-tool formatting
- document that `tool` mode is less safe

### Risk: formatter chains create unexpected file churn

Mitigation:

- explicit ordering
- only format touched files
- clear reporting

### Risk: shell-driven file mutations remain uncovered

Mitigation:

- treat as a known limitation in v1
- design extension internals so more mutation sources can be added later

### Risk: formatter failures become invisible

Mitigation:

- always capture per-file formatter results
- surface warnings in interactive and non-interactive contexts

## Open Questions

These do not block repository creation, but should be answered during implementation:

1. What should the config file path be for a shared Pi package?
2. Should built-in formatter detection prefer project-local binaries over global commands?
3. Should formatter chain order come from explicit config only, or can overlapping extension matches imply order?
4. How much effort should go into shell-driven mutation coverage in v1?
5. Should formatter failures ever be allowed to fail the overall tool call in a strict mode?

## Recommended First Milestone

Build a Pi extension that:

- hooks `write` and `edit`
- batches touched files until prompt end
- runs configured formatter chains on those files
- supports at least custom commands with `$FILE`
- reports formatter failures clearly without blocking edits

That delivers the core value quickly and addresses the original problem directly.
