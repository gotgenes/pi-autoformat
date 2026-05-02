# pi-autoformat

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-autoformat?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-autoformat) [![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-autoformat/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-autoformat/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/) [![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

`pi-autoformat` is a Pi extension package that automatically formats files after the agent edits them.

## The problem this package solves

Pi agents often make correct code changes that still fail at commit time because formatting was never run.

That creates a frustrating workflow:

1. the agent edits files
2. the agent appears done
3. pre-commit hooks or CI run formatters later
4. files mutate after the fact
5. commits fail or the agent has to recover from surprise formatting changes

This package moves formatting earlier in the workflow so the agent is less likely to leave behind unformatted files.

## How it works

`pi-autoformat` watches files touched by Pi mutation tools and runs configured formatter commands for just those files.

Design goals:

- format only files the agent touched
- prefer prompt-end batching over per-edit formatting by default
- support repository-specific formatter commands
- support ordered formatter chains for the same extension
- surface formatter failures without blocking the original edit by default
- keep reporting concise by default, with interactive summaries and non-interactive logs
- delegate formatter configuration to the formatters themselves — `pi-autoformat` invokes the tool and lets it find its own project config (Prettier, Biome, ESLint, ruff, etc. all walk up the directory tree natively)

Default behavior is **prompt mode**:

- collect files touched during the agent's work
- run formatters once after the prompt finishes

This is safer than formatting immediately after every edit because prompt-end batching avoids mutating a file in between sibling exact-text edits.

## Installation

### From npm

```bash
pi install npm:@gotgenes/pi-autoformat
```

### Local development checkout

```bash
pi install /absolute/path/to/pi-autoformat
```

## Configuration

`pi-autoformat` uses extension-owned config files.

Configuration is loaded in this order:

1. global: `~/.pi/agent/extensions/pi-autoformat/config.json`
2. project: `.pi/extensions/pi-autoformat/config.json`

Project config overrides global config.

Example:

```json
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-autoformat/main/schemas/pi-autoformat.schema.json",
  "formatMode": "prompt",
  "commandTimeoutMs": 10000,
  "hideSummariesInTui": false,
  "formatters": {
    "prettier": {
      "command": ["prettier", "--write"]
    },
    "markdownlint-cli2": {
      "command": ["markdownlint-cli2", "--fix"]
    }
  },
  "chains": {
    ".md": ["prettier", "markdownlint-cli2"],
    ".ts": ["prettier"],
    ".tsx": ["prettier"]
  }
}
```

See [docs/configuration.md](docs/configuration.md) for the full configuration reference.

Formatter command resolution in v1 stays intentionally simple:

- built-in formatter commands run from the project `cwd`
- the extension uses the inherited environment and `PATH`
- if your environment manager already resolves the right tool for that directory, plain commands like `prettier` can work as-is
- if your repo needs wrappers such as `pnpm exec`, `npx`, `mise x`, or similar, configure those commands explicitly in `formatters`

## Reporting behavior

By default, `pi-autoformat` reports:

- concise success summaries after formatting runs
- per-batch failure summaries when one or more formatter commands fail
- config validation issues detected while loading global or project config

In the interactive TUI, success summaries render as a persistent one-line footer status (e.g. `✓ autoformat: 3 files (biome, prettier)`) instead of a transient notification, so you can see at a glance that formatters ran in the background.
Failures both fire a warning notification (so they catch your eye once) and leave an error-styled footer status (e.g. `✗ autoformat: 1 batch failed (prettier)`) that persists until the next flush, so a dismissed toast does not lose the failure.

Outside the TUI, summaries are written as prefixed log lines on `stdout` / `stderr` (`console.log` / `console.warn`).

Set `hideSummariesInTui` to `true` if you want to suppress the interactive success status line.
Failures still surface via both the notification and the footer status regardless of this setting.

## Formatter model

Each formatter entry can define:

- `command: string[]`
- `environment?: Record<string, string>`
- `disabled?: boolean`

The legacy `extensions: string[]` field has been removed.
Dispatch is driven entirely by `chains`.
On-disk configs that still carry `extensions` continue to load but emit a one-line deprecation notice.

Touched file paths are appended to `command` as trailing arguments; each chain step runs once per group of files that share the same chain.
Do not include `$FILE` in `command` — it is rejected at config-load time.

Chains are configured separately so formatter order is explicit.

For v1, `pi-autoformat` runs formatters only when a `chains` entry exists for the file extension.

Example Markdown chain:

1. `prettier --write`
2. `markdownlint-cli2 --fix`

### Fallback chain steps

A chain step can be either a formatter name (string) or a fallback group:

```json
{
  "chains": {
    ".ts": [{ "fallback": ["biome", "prettier"] }],
    ".tsx": [{ "fallback": ["biome", "prettier"] }],
    ".md": [
      { "fallback": ["biome", "prettier"] },
      "markdownlint-cli2"
    ]
  }
}
```

A fallback group runs the **first** listed formatter whose command is found on `PATH`.
The only fallthrough trigger is "command not found":

| Outcome of formatter N in the group | Behavior                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| Command not on `PATH`               | Skip, try N+1                                                   |
| Command runs, exits 0               | Success, stop the group                                         |
| Command runs, exits non-zero        | Failure, stop the group, report — do **not** mask by retrying   |
| All formatters missing from `PATH`  | Group is a no-op                                                |

When a non-first alternative wins, reporting names which one ran (e.g. `prettier (fallback after biome unavailable)`) so you understand what actually formatted the files.

#### Choosing a chain strategy

**Recommendation: prefer project-level `chains` over relying on global fallback.**

Global `chains` in `~/.pi/agent/extensions/pi-autoformat/config.json` are convenient defaults, but become ambiguous in repositories that use multiple alternative tools.
A project-level `chains` declaration in `.pi/extensions/pi-autoformat/config.json` is explicit, predictable, and survives team handoffs.

Global fallback (`[{ "fallback": ["biome", "prettier"] }]`) is best treated as a "what to do when no project config has opinions" backstop — useful for ad-hoc repos, not load-bearing for projects you maintain.

#### Fallback caveat

**Fallback chooses the first formatter whose command is on `PATH`.**
It does **not** check whether the tool actually has a project config to apply.
A globally installed Biome will win a `[biome, prettier]` fallback even in repos that use Prettier — and Biome will format the file with its built-in defaults.
If both alternatives are realistic in your environment, declare a project-level chain to disambiguate.

## Validation and autocomplete

The config file supports JSON Schema-based validation and editor autocomplete.

You can use either:

- the default-branch URL for the latest schema
- a pinned release-tag URL for reproducible validation

Examples:

```json
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-autoformat/main/schemas/pi-autoformat.schema.json"
}
```

```json
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-autoformat/v1.0.0/schemas/pi-autoformat.schema.json"
}
```

## Status

This project is under active development.

The current repository includes the formatter registry, execution pipeline, touched-file queue, config loading and validation, and the Pi extension runtime wiring for prompt-, tool-, and session-mode flushing.

Known v1 limitations:

- shell mutation detection is opt-in (see below) and intentionally narrow
- reporting is intentionally concise by default; opt in to surfacing failed-run stderr (or stdout+stderr) via the `formatterOutput` config option (see [docs/configuration.md](docs/configuration.md#formatteroutput))

## Format scope

Paths outside the configured `formatScope` are silently dropped from the touched-files queue.
The default scope is the Git toplevel detected via `git rev-parse --show-toplevel`, with a fallback to `cwd` when not in a Git repo.
Set `formatScope` to `"cwd"` for a strict cwd subtree, or to an array of paths for an explicit allowlist.
Symlinks are resolved on both sides so workspace deps that link out of the scope are correctly excluded.

This is a tightening of v1 behavior: previously `write` / `edit` would format any path the agent supplied.
The new default closes a latent gap and is almost certainly what users already expect; configure `formatScope` explicitly if you need a broader allowlist.

## Shell mutation coverage

Files modified by `bash` invocations — `sed -i`, `mv`, `cp`, `touch`, `tee`, redirections, codegen wrappers — are invisible to the touched-files queue by default.
Set `shellMutationDetection.enabled` to `true` to opt in.

Three explicit, low-noise strategies are available:

1. **Argument parsing** (default on once detection is enabled) for a small whitelist of known mutating commands.
   Bails on pipelines, command substitutions, and unknown flags.
2. **Snapshot tracking** of explicit globs around each `bash` invocation — files whose mtime advanced are treated as touched.
3. **User-declared wrappers** that already print the files they touched on stdout (one per line).

See [docs/configuration.md](docs/configuration.md) for the full configuration.

## Custom mutation tools and EventBus integration

Beyond `write`, `edit`, and shell detection, two additional surfaces let project- and extension-specific mutations participate in the same prompt-end formatter pipeline:

- `customMutationTools` — declare extra tool names the agent calls and which fields in their `input` payload point at touched files.
  Useful for codegen tools, custom refactor commands, etc.
- `eventBusMutationChannel` — subscribe to Pi's shared event bus (default channel `autoformat:touched`) and accept `{ path }` or `{ paths }` payloads from peer extensions.

Both feed the same touched-files queue, so scope filtering, dedupe, and formatter resolution behave identically to the built-in tools.

## Development

```bash
pnpm install
pnpm test
pnpm run lint
```

See [`docs/testing.md`](docs/testing.md) for the layout of unit, acceptance, and (future) LLM-gated test suites, and how the acceptance harness resolves the `pi` binary from `node_modules/.bin/pi`.

## License

MIT
