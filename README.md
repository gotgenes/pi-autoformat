# pi-autoformat

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-autoformat?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-autoformat)
[![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-autoformat/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-autoformat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

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
- per-file failure summaries when one or more formatter commands fail
- config validation issues detected while loading global or project config

In the interactive TUI, these appear as notifications.

Outside the TUI, they are written as prefixed log lines.

Set `hideSummariesInTui` to `true` if you want to suppress interactive success summaries while still surfacing failures.

## Formatter model

Each formatter entry can define:

- `command: string[]`
- `extensions: string[]`
- `environment?: Record<string, string>`
- `disabled?: boolean`

`$FILE` is replaced with the absolute path of the touched file.

Chains are configured separately so formatter order is explicit.

For v1, `pi-autoformat` runs formatters only when a `chains` entry exists for the file extension.

Example Markdown chain:

1. `prettier --write`
2. `markdownlint-cli2 --fix`

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
- reporting is intentionally concise and does not yet expose full formatter stdout/stderr by default

## Format scope

Paths outside the configured `formatScope` are silently dropped from the
touched-files queue. The default scope is the Git toplevel detected via
`git rev-parse --show-toplevel`, with a fallback to `cwd` when not in a Git
repo. Set `formatScope` to `"cwd"` for a strict cwd subtree, or to an array
of paths for an explicit allowlist. Symlinks are resolved on both sides so
workspace deps that link out of the scope are correctly excluded.

This is a tightening of v1 behavior: previously `write` / `edit` would
format any path the agent supplied. The new default closes a latent gap and
is almost certainly what users already expect; configure `formatScope`
explicitly if you need a broader allowlist.

## Shell mutation coverage

Files modified by `bash` invocations — `sed -i`, `mv`, `cp`, `touch`, `tee`,
redirections, codegen wrappers — are invisible to the touched-files queue
by default. Set `shellMutationDetection.enabled` to `true` to opt in.

Three explicit, low-noise strategies are available:

1. **Argument parsing** (default on once detection is enabled) for a small
   whitelist of known mutating commands. Bails on pipelines, command
   substitutions, and unknown flags.
2. **Snapshot tracking** of explicit globs around each `bash` invocation —
   files whose mtime advanced are treated as touched.
3. **User-declared wrappers** that already print the files they touched on
   stdout (one per line).

See [docs/configuration.md](docs/configuration.md) for the full configuration.

## Development

```bash
pnpm install
pnpm test
pnpm run lint
```

## License

MIT
