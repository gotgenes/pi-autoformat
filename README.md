# pi-autoformat

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

Example Markdown chain:

1. `prettier --write`
2. `markdownlint-cli2 --fix`

## Validation and autocomplete

The config file supports JSON Schema-based validation and editor autocomplete via:

```json
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-autoformat/main/schemas/pi-autoformat.schema.json"
}
```

## Status

This project is under active development.

The current repository includes the formatter registry, execution pipeline, touched-file queue, config loading and validation, and the Pi extension runtime wiring for prompt-, tool-, and session-mode flushing.

Known v1 limitations:

- only Pi `write` and `edit` mutations are tracked automatically
- arbitrary shell-driven file mutations are not detected yet
- reporting is intentionally concise and does not yet expose full formatter stdout/stderr by default

## Development

```bash
pnpm install
pnpm test
pnpm run lint
```

## License

MIT
