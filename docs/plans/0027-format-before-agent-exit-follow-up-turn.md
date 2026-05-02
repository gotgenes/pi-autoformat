---
issue: 27
issue_title: "Format before agent exit and give the agent a follow-up turn"
---

# Format before agent exit and give the agent a follow-up turn

## Problem Statement

Autoformatting currently runs at `agent_end`, after the agent has fully exited its turn loop.
This causes two problems:

1. The agent discovers dirty state (formatting diffs) it did not produce on its next invocation, leading to confusion or unnecessary corrective actions.
2. In commit-and-push workflows like `/ship-issue`, the agent commits its work before formatting runs, so the pushed commit contains unformatted code.

Both problems share a root cause: the agent never gets a chance to observe or react to formatting changes.

## Goals

1. After formatting runs, give the agent one follow-up turn so it can see which files changed and react (e.g., amend a commit, acknowledge, or adjust).
2. Prevent infinite loops: if the follow-up turn produces no new touched files, do not format again.
3. Expose the behavior as a new boolean config field (`notifyAgent`), orthogonal to the existing `formatMode` timing control.
4. Keep the existing `formatMode: "prompt"` batching: formatting still runs once at `agent_end`, not per-tool.
5. Skip the follow-up turn when formatting produced no file changes (the formatter ran but files were already correctly formatted, or no files were queued).

## Non-Goals

1. Per-tool formatting improvements (issue is orthogonal to `formatMode: "tool"`).
2. Changing the default `formatMode` value.
3. Detecting whether the formatter actually changed file content (byte-level diffing).
   The initial implementation triggers the follow-up turn whenever the flush produces non-empty groups with successful runs.
   Byte-level diffing is a potential follow-up optimization.
4. Customizing the follow-up message content via config.

## Background

### Relevant modules

| Module | Role |
|---|---|
| `src/extension.ts` | Extension entrypoint. Registers lifecycle handlers (`session_start`, `tool_result`, `agent_end`, `session_shutdown`). Owns `queueFlush()` and result reporting. |
| `src/formatter-config.ts` | Defines `FormatMode`, `AutoformatConfig`, `UserFormatterConfig`, default values, and `createFormatterConfig()`. |
| `src/config-loader.ts` | Loads and merges global/project config files, validates against schema, produces `LoadConfigResult`. |
| `src/prompt-autoformatter.ts` | `PromptAutoformatter` class. Tracks touched files, runs formatter chains, returns `PromptAutoformatterResult`. |
| `schemas/pi-autoformat.schema.json` | JSON Schema for config validation. |
| `docs/configuration.md` | User-facing config documentation. |
| `test/extension.test.ts` | Extension lifecycle tests with `TestPi` harness. |

### Pi extension API surface used

The `ExtensionAPI` (aliased `pi`) provides:

```typescript
pi.on("agent_end", handler)          // current flush trigger
pi.sendMessage(message, options)     // NEW — will use { triggerTurn: true }
```

`pi.sendMessage` accepts:

```typescript
sendMessage<T>(
  message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
  options?: {
    triggerTurn?: boolean;
    deliverAs?: "steer" | "followUp" | "nextTurn";
  }
): void;
```

When `triggerTurn: true` is set, Pi re-enters the agent loop for one more turn.
The agent sees the custom message content and can use tools or respond with text.

### Session data insights

Analysis of ~1,900 assistant turns shows 93.4% contain exactly one tool call, confirming that agents work sequentially across turns.
The average mutation-turn streak is 4.6 turns.
This validates keeping prompt-end batching (`agent_end`) as the formatting trigger rather than per-turn or per-tool.

## Design Overview

### Sequence with `notifyAgent: true`

```text
Turn N:   agent makes final edits
Turn N+1: agent says "Done!" → agent_end fires
            ↓
          extension flushes formatter (batched, same as today)
            ↓
          result has successful groups?
            ├─ no  → done (no follow-up turn, no sendMessage)
            └─ yes → pi.sendMessage(
                       { customType: "autoformat-notify", content: "..." },
                       { triggerTurn: true }
                     )
            ↓
Turn N+2: agent sees the notification, can react
            ↓
          agent_end fires again
            ↓
          flush again (new touched files from Turn N+2?)
            ├─ no new groups → done (no follow-up)
            └─ yes → send another notification (rare, bounded)
```

### Loop safety

A `followUpSent` flag on `SessionState` tracks whether the most recent `agent_end` was a follow-up.
After formatting, the extension only calls `sendMessage` when:

1. The flush produced at least one group with at least one successful run.
2. `followUpSent` is `false` (prevents unbounded re-triggering).

The flag resets to `false` on every `agent_end` entry, then is set to `true` after sending the follow-up.
This means at most one follow-up turn per user prompt.

If the agent makes new edits during the follow-up turn, those edits are recorded normally.
On the second `agent_end`, formatting runs again but no further follow-up is sent (the flag is already `true` from the prior send, reset then immediately set again — wait, let me clarify).

Revised flag logic:

1. On `agent_end` entry: read `followUpSent`, then reset it to `false`.
2. After flush: if results are non-empty and the *previously read* `followUpSent` was `false`, call `sendMessage` and set `followUpSent = true`.
3. This ensures: first `agent_end` → format + notify. Second `agent_end` → format (if new edits) but no notify.

### Config shape

```typescript
// In UserFormatterConfig (user-facing, optional)
notifyAgent?: boolean;

// In AutoformatConfig (resolved, required)
notifyAgent: boolean;  // default: false
```

The field is orthogonal to `formatMode`.
When `formatMode` is `"tool"` or `"session"`, `notifyAgent` is accepted but has no effect (tool-mode formats inline and the agent already sees results; session-mode formats after the session ends).
The extension logs a config issue if `notifyAgent: true` is set with an incompatible `formatMode`.

### Message content

The follow-up message includes the list of formatted files so the agent knows exactly what changed:

```text
Autoformatted 3 file(s): src/foo.ts, src/bar.ts, README.md
```

For large file lists (>10 files), truncate with a count:

```text
Autoformatted 25 file(s): src/foo.ts, src/bar.ts, ... and 23 more
```

The `customType` is `"autoformat-notify"` so Pi can render it distinctly and the message is identifiable in session logs.

### `sendMessage` availability

`pi.sendMessage` is available on the `ExtensionAPI` object (the `pi` parameter passed to the extension factory), not on the per-event `ExtensionContext`.
The extension already holds a reference to `pi` in the closure, so no new wiring is needed.

## Module-Level Changes

### `src/formatter-config.ts`

1. Add `notifyAgent?: boolean` to `UserFormatterConfig`.
2. Add `notifyAgent: boolean` to `AutoformatConfig` (default: `false`).
3. Wire through `createFormatterConfig()`.

### `schemas/pi-autoformat.schema.json`

1. Add `notifyAgent` boolean property with description.

### `src/extension.ts`

1. Add `followUpSent: boolean` to `SessionState`.
2. In the `agent_end` handler for `formatMode: "prompt"`:
   1. Read and reset `followUpSent`.
   2. After flush, if result has successful groups and prior `followUpSent` was `false`, compose the notification message and call `pi.sendMessage(...)`.
   3. Set `followUpSent = true`.
3. Add a helper `buildNotifyMessage(result: PromptAutoformatterResult): string` to compose the file list.
4. Extend `TestPi` in tests to capture `sendMessage` calls.

### `src/config-loader.ts`

1. Surface a config issue if `notifyAgent: true` with `formatMode` other than `"prompt"`.

### `docs/configuration.md`

1. Document `notifyAgent` field, its default, interaction with `formatMode`, and behavior.

### `README.md`

1. Add brief mention of `notifyAgent` in the config overview section.

### `test/extension.test.ts`

1. New tests for the follow-up turn flow.

### `test/config-loader.test.ts`

1. Test that `notifyAgent: true` with non-prompt `formatMode` produces a config issue.

## TDD Order

### 1. Config types and defaults

- **Test surface:** `test/formatter-config.test.ts` (if it exists) or inline in `test/config-loader.test.ts`.
- **Covers:** `notifyAgent` defaults to `false`; user-supplied `true` is preserved; field appears in resolved config.
- **Commit:** `feat: add notifyAgent config field (#27)`

### 2. Schema update

- **Test surface:** `test/schema.test.ts`.
- **Covers:** JSON schema accepts `notifyAgent` boolean; rejects non-boolean values.
- **Commit:** `feat: add notifyAgent to config schema (#27)`

### 3. Config issue for incompatible formatMode

- **Test surface:** `test/config-loader.test.ts`.
- **Covers:** `notifyAgent: true` with `formatMode: "tool"` or `"session"` produces a validation issue; `formatMode: "prompt"` does not.
- **Commit:** `feat: warn on notifyAgent with non-prompt formatMode (#27)`

### 4. Notification message builder

- **Test surface:** `test/extension.test.ts` (or a new `test/notify-message.test.ts` if extracted).
- **Covers:** Message text with 1 file, 3 files, 11 files (truncation), 0 files (returns `undefined`).
- **Commit:** `feat: add buildNotifyMessage helper (#27)`

### 5. Follow-up turn on successful flush

- **Test surface:** `test/extension.test.ts`.
- **Covers:** When `notifyAgent: true` and flush has successful groups, `pi.sendMessage` is called with `{ triggerTurn: true }` and the composed message. Verify `customType` is `"autoformat-notify"`.
- **Commit:** `feat: send follow-up turn after formatting (#27)`

### 6. No follow-up on empty flush

- **Test surface:** `test/extension.test.ts`.
- **Covers:** When flush returns empty groups, `sendMessage` is not called.
- **Commit:** `test: no follow-up turn on empty flush (#27)`

### 7. No follow-up when `notifyAgent` is false

- **Test surface:** `test/extension.test.ts`.
- **Covers:** Default config (notifyAgent: false) does not call `sendMessage` even with successful groups.
- **Commit:** `test: notifyAgent false suppresses follow-up (#27)`

### 8. Loop guard — at most one follow-up per user prompt

- **Test surface:** `test/extension.test.ts`.
- **Covers:** Simulate two consecutive `agent_end` events (first triggers follow-up, second does not). Verify `sendMessage` called exactly once.
- **Commit:** `test: follow-up turn loop guard (#27)`

### 9. Follow-up resets across user prompts

- **Test surface:** `test/extension.test.ts`.
- **Covers:** After a full cycle (agent_end → follow-up → agent_end), a new user prompt (simulated via a fresh agent_end with new tool results) triggers a fresh follow-up.
- **Commit:** `test: follow-up resets across prompts (#27)`

### 10. Documentation

- **Test surface:** Manual review.
- **Covers:** `docs/configuration.md`, `README.md`, schema description.
- **Commit:** `docs: document notifyAgent config field (#27)`

## Risks and Mitigations

### Risk: Infinite follow-up loop

The `followUpSent` flag ensures at most one follow-up per user prompt.
Even if the follow-up turn triggers new edits that produce a non-empty flush on the second `agent_end`, no further `sendMessage` is sent.

### Risk: `sendMessage` unavailable or behaves differently in RPC/print mode

`pi.sendMessage` is on `ExtensionAPI`, which is always present.
If Pi is running in non-interactive mode and `triggerTurn` is unsupported, the call is a no-op or the message is simply logged.
The extension does not gate on `ctx.hasUI` — it sends the message regardless and lets Pi decide how to deliver it.
If this proves problematic, a follow-up can add a `hasUI` guard.

### Risk: Follow-up turn costs tokens

The follow-up turn requires one additional LLM call.
For most prompts this is a short acknowledgement ("Noted, files are formatted.") that costs minimal tokens.
The feature is opt-in (`notifyAgent: false` by default), so users who are cost-sensitive are not affected.

### Risk: Agent makes new edits during follow-up turn

This is expected and handled: the second `agent_end` runs the formatter again on any new touched files.
The loop guard prevents a third follow-up turn.
In the unlikely case that the agent reformats its own follow-up edits incorrectly, the user sees a normal formatter report and can intervene.

## Open Questions

1. Should `notifyAgent` eventually become the default (`true`) for `formatMode: "prompt"`?
   Defer until real-world feedback confirms the feature is reliable and the extra turn cost is acceptable.
2. Should the notification message include a diff summary (e.g., lines changed) rather than just file names?
   Defer — file names are sufficient for the agent to decide whether to act.
3. Should the follow-up turn be skipped when the formatter ran but produced no byte-level changes?
   Defer — requires reading files before and after formatting, which adds I/O overhead.
   The initial implementation triggers on any non-empty successful flush.
