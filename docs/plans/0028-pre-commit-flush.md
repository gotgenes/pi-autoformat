---
issue: 31
issue_title: "Pre-commit flush: format touched files before agent-initiated git commits"
---

# Pre-commit flush: format touched files before agent-initiated git commits

## Problem Statement

pi-autoformat runs its formatter flush on `agent_end`, which fires after the agent's full turn completes.
In TDD workflows (write → test → commit), the agent calls `Write`/`Edit` then `Bash("git commit ...")` within the same turn.
The commit happens before `agent_end`, so files are unformatted and pre-commit hooks (e.g. Biome via prek) reject the commit.

Observed in `pi-permission-system`: 3 of ~10 commits were rejected by Biome, requiring the agent to run `npm run lint:fix`, re-stage, and retry — wasting tokens and time.

```text
Turn N:
  1. Agent calls Write/Edit          → unformatted .ts files on disk
  2. Agent calls Bash("vitest run")  → tests pass
  3. Agent calls Bash("git commit")  → prek runs Biome, REJECTS
  4. Agent calls Bash("lint:fix")    → manual fix
  5. Agent calls Bash("git commit")  → succeeds
  ...
agent_end fires here — too late
```

## Relationship to Plan 0027

Plan 0027 (`notifyAgent`) already addresses the *post-turn* gap: it sends a follow-up turn so the agent can observe formatting changes.
This plan addresses a different gap: files need to be formatted *during* a turn, before a commit that happens within that turn.
The two are complementary — 0027 handles the inter-turn case, this plan handles the intra-turn case.

## Design Options Evaluated

### Option A: Eager format on every `tool_result` for write/edit

Format touched files immediately after each `Write`/`Edit` tool completes.

**Pros:** Simple; files always formatted before any subsequent tool call.

**Cons:**

- Formats between consecutive edits (agent writes 5 files, formatter runs 5 times).
- Can corrupt `Edit` tool's `oldText` matching if the formatter changes a file between two edits to the same file (this is why `formatMode: "tool"` was removed in plan 0027).
- High overhead for the common case where no commit follows.

**Verdict:** Rejected — same problems that led to removing `formatMode: "tool"`.

### Option B: Detect `git commit` in `tool_call` and flush before it runs

Intercept `tool_call` for `bash` commands, detect `git commit` patterns, and flush pending formatted files before the bash tool executes.

**Pros:**

- Targeted: only flushes when a commit is imminent.
- Uses existing `tool_call` hook which Pi awaits before executing the tool.
- No wasted formatting for non-commit workflows.

**Cons:**

- Command detection is heuristic (shell parsing edge cases).
- Adds latency to the commit tool call (formatter runs synchronously before bash).
- Need to handle `git add` + staging interaction (formatter changes must be staged).

**Verdict:** Recommended — targeted, low false-positive risk, leverages existing infrastructure.

### Option C: Expose a `pi autoformat flush` command for the agent to call

Register a tool or slash command the agent can invoke explicitly before committing.

**Pros:** No heuristics; agent explicitly requests formatting.

**Cons:**

- Requires the agent to *remember* to call it — the whole point is it shouldn't have to.
- Would need system prompt injection to teach the agent about the command.
- Doesn't help existing workflows/templates that don't know about it.

**Verdict:** Viable as a complementary escape hatch, not as the primary mechanism.

### Option D: Accept the limitation and document it

Tell agents to run the formatter before committing.

**Verdict:** Last resort — defeats the purpose of *auto*-formatting.

## Recommended Design: Option B — Pre-commit flush via `tool_call` interception

### How it works

```text
Turn N:
  1. Agent calls Write("src/foo.ts") → tool_result → queue records foo.ts
  2. Agent calls Write("src/bar.ts") → tool_result → queue records bar.ts
  3. Agent calls Bash("git commit -am '...'")
     → tool_call fires BEFORE bash executes
     → extension detects "git commit" pattern
     → flushPrompt() runs formatters on foo.ts, bar.ts
     → git add foo.ts bar.ts (re-stage formatted files)
     → tool_call handler returns (no block)
     → bash tool runs git commit — prek passes
```

### API surface

The `tool_call` event already provides `BashToolCallEvent.input.command` (the full bash command string).
The handler returns `Promise<ToolCallEventResult | void>` — Pi awaits it before executing the tool.
No new Pi API surface is needed.

### Command detection

Reuse the existing `parseKnownCommand` / `tokenizeSimpleCommand` infrastructure in `src/shell-mutation-detector.ts`.
Add a focused detector for git-commit-like commands:

```typescript
function isGitCommitCommand(command: string): boolean {
  // Detect: git commit, git commit -m "...", git commit -am "..."
  // Also: git commit --amend, etc.
  // Does NOT match: git add, git push, git log
  const parsed = tokenizeSimpleCommand(command);
  if (!parsed) return false;
  const argv = parsed.argv;
  if (argv[0] !== "git") return false;
  return argv[1] === "commit";
}
```

This is conservative — only matches simple `git commit` commands.
Complex shell constructs (pipes, `&&` chains) cause `tokenizeSimpleCommand` to bail, which is safe (no flush, commit may fail, agent retries).

### Re-staging after format

When the flush formats files that are already staged, the formatted versions must be re-staged before the commit proceeds.
The extension should run `git add <formatted-files>` after the flush completes.
Only re-stage files that were already in the git index (don't stage untracked files that happen to be in the queue).

```typescript
// After flushPrompt() returns:
// 1. Get list of staged files: git diff --cached --name-only
// 2. Intersect with formatted files
// 3. git add <intersection>
```

### Config

Add an optional boolean config field:

```typescript
// UserFormatterConfig
preCommitFlush?: boolean;

// AutoformatConfig (resolved)
preCommitFlush: boolean;  // default: true
```

Default `true` because this is the ergonomic fix users expect.
Can be disabled if the detection causes issues.

### Interaction with `agent_end` flush

Files formatted during a pre-commit flush are removed from the touched queue (the queue's `flush()` clears them).
The `agent_end` flush only formats files touched *after* the pre-commit flush.
This is already how the queue works — `flush()` returns and clears.

If the agent edits more files after the commit, those accumulate and are formatted at `agent_end` as usual.

### Interaction with `notifyAgent` (plan 0027)

The `agent_end` handler's `notifyAgent` follow-up only fires for files formatted at `agent_end`.
Files formatted during the pre-commit flush do not trigger a follow-up (they were already handled inline).

### Error handling

- If `flushPrompt()` fails, log a warning and let the bash tool proceed (don't block the commit).
- If `git add` re-staging fails, log a warning and proceed (the commit may still succeed if the changes are minor).
- Formatter timeout uses the existing `commandTimeoutMs` config.

## Module-Level Changes

### `src/extension.ts`

1. Expand the existing `tool_call` handler: when `event.toolName === "bash"` and the command matches `isGitCommitCommand()`, call `queueFlush(ctx)` and then re-stage formatted files.
2. Extract `isGitCommitCommand(command: string): boolean` (or place in `shell-mutation-detector.ts`).
3. Add `restageFormattedFiles(cwd, files)` helper that intersects formatted files with the staged set and runs `git add`.

### `src/shell-mutation-detector.ts`

1. Export `isGitCommitCommand()` if placed here (leverages existing `tokenizeSimpleCommand`).

### `src/formatter-config.ts`

1. Add `preCommitFlush?: boolean` to `UserFormatterConfig`.
2. Add `preCommitFlush: boolean` to `AutoformatConfig` (default: `true`).
3. Wire through `createFormatterConfig()`.

### `src/config-loader.ts`

1. Add `preCommitFlush` boolean validation.
2. Wire through merge.

### `schemas/pi-autoformat.schema.json`

1. Add `preCommitFlush` boolean property.

### `docs/configuration.md`

1. Document `preCommitFlush`.

### `src/prompt-autoformatter.ts`

1. No changes — `flushPrompt()` already returns the formatted file list and clears the queue.

## TDD Order

### 1. `isGitCommitCommand` detector

- **Test surface:** `test/shell-mutation-detector.test.ts` or new `test/git-commit-detector.test.ts`.
- **Covers:** `git commit`, `git commit -m "msg"`, `git commit -am "msg"`, `git commit --amend`, negative cases (`git add`, `git push`, `git log`, `echo git commit`, `git commit | cat`).
- **Commit:** `feat: add isGitCommitCommand detector (#31)`

### 2. `preCommitFlush` config field

- **Test surface:** `test/config-loader.test.ts`.
- **Covers:** Defaults to `true`; user-supplied `false` preserved; non-boolean rejected.
- **Commit:** `feat: add preCommitFlush config field (#31)`

### 3. Pre-commit flush in `tool_call` handler

- **Test surface:** `test/extension.test.ts`.
- **Covers:** Write + Bash("git commit") → flush runs before commit. Write + Bash("ls") → no flush. `preCommitFlush: false` → no flush even for git commit.
- **Commit:** `feat: flush formatters before agent-initiated git commits (#31)`

### 4. Re-staging formatted files

- **Test surface:** `test/extension.test.ts`.
- **Covers:** Formatted files that were staged get re-staged. Untracked formatted files are not staged.
- **Commit:** `feat: re-stage formatted files before git commit (#31)`

### 5. Error resilience

- **Test surface:** `test/extension.test.ts`.
- **Covers:** Flush failure → warning logged, commit proceeds. Re-stage failure → warning logged, commit proceeds.
- **Commit:** `test: pre-commit flush error resilience (#31)`

### 6. Documentation

- **Commit:** `docs: document preCommitFlush and pre-commit formatting (#31)`

## Risks and Mitigations

### False positive command detection

A bash command like `echo "git commit"` inside a string could theoretically match.
Mitigation: `tokenizeSimpleCommand` is conservative — it bails on complex constructs, and the pattern requires `git` as `argv[0]`.
Risk is very low.

### Formatter latency before commit

The flush adds formatter execution time before the commit.
Mitigation: only files touched since the last flush are formatted (typically 1-5 files).
The existing `commandTimeoutMs` prevents hangs.

### Staged file state corruption

If the formatter changes a file that has both staged and unstaged changes, re-staging could include the unstaged changes.
Mitigation: this is the same behavior as running `npm run lint:fix && git add` manually — which is exactly what the agent does today when the commit is rejected.
The pre-commit flush is strictly better than the status quo.

### Multi-command bash strings

`git add . && git commit -m "..."` — `tokenizeSimpleCommand` bails on `&&`.
The flush would not trigger, and the commit would fail as it does today.
A follow-up could add `&&`-chain parsing, but the conservative approach is safer initially.

## Open Questions

1. Should we also detect `git add` and flush before staging?
   Probably not — `git add` before formatting would stage unformatted files, but the commit hook would still catch it.
   The pre-commit flush handles the critical path.

2. Should re-staging use `git add -u` (update all tracked) instead of per-file adds?
   Per-file is safer — avoids staging unrelated changes.

3. Should the pre-commit flush report results to the TUI?
   Yes — reuse the existing `reportFlushResult` path, which already handles TUI summaries.
