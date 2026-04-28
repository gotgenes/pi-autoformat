# Configuration

`pi-autoformat` uses extension-owned config files.

## Config locations

Configuration is loaded from these files, in order:

1. global: `~/.pi/agent/extensions/pi-autoformat/config.json`
2. project: `.pi/extensions/pi-autoformat/config.json`

Project config overrides global config.

## Schema validation

The config file is designed to support JSON Schema validation and autocomplete.

You can point `$schema` at either:

- the default-branch URL for the latest published schema
- a pinned release-tag URL for reproducible validation

Examples:

Latest:

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

Pinned tag:

```json
{
  "$schema": "https://raw.githubusercontent.com/gotgenes/pi-autoformat/v1.0.0/schemas/pi-autoformat.schema.json"
}
```

## Settings reference

### `formatMode`

When formatting should run.

Allowed values:

- `"prompt"` — format once after the agent finishes the prompt. Recommended default.
- `"tool"` — format immediately after each successful mutation tool call.
- `"session"` — accumulate touched files and format on session shutdown.

### `commandTimeoutMs`

Timeout in milliseconds for each formatter command.

Example:

```json
{
  "commandTimeoutMs": 10000
}
```

### `hideSummariesInTui`

Whether formatter summaries should be hidden in the interactive TUI.

Example:

```json
{
  "hideSummariesInTui": false
}
```

### `formatters`

Formatter registry keyed by formatter name.

Each formatter can define:

- `command: string[]`
- `extensions: string[]`
- `environment?: Record<string, string>`
- `disabled?: boolean`

`$FILE` is replaced with the absolute path to the touched file.

For v1, formatter command resolution stays intentionally simple:

- commands run from the project `cwd`
- commands inherit the extension process environment and `PATH`
- the extension does not try to auto-detect and invoke project-local binaries on its own
- if your repo needs wrappers such as `pnpm exec`, `npx`, or `mise x`, configure them explicitly in `command`

Example:

```json
{
  "formatters": {
    "prettier": {
      "command": ["pnpm", "exec", "prettier", "--write", "$FILE"],
      "extensions": [".js", ".ts", ".tsx", ".json", ".md"]
    },
    "markdownlint-cli2": {
      "command": ["pnpm", "exec", "markdownlint-cli2", "--fix", "$FILE"],
      "extensions": [".md"],
      "environment": {
        "CI": "1"
      }
    }
  }
}
```

### `chains`

Ordered formatter chains keyed by file extension.

The chain order is explicit and should be preserved.

Example:

```json
{
  "chains": {
    ".md": ["prettier", "markdownlint-cli2"],
    ".ts": ["prettier"],
    ".tsx": ["prettier"]
  }
}
```

## Merge behavior

Merge order:

1. built-in defaults
2. global config
3. project config

Recommended merge semantics:

- top-level scalar values override by precedence
- `formatters` merge by formatter name
- `chains` merge by extension key
- when a project config defines a formatter or chain key, that key replaces the lower-precedence value for that entry

This keeps repo-local formatter behavior explicit while still allowing users to set global defaults such as `formatMode`.

## Notes

- Config is intentionally separate from Pi's shared `settings.json`.
- A dedicated config file avoids collisions with Pi core settings and makes strict schema validation practical.
- Schema URLs can point at either the default branch or pinned release tags depending on whether you want latest or reproducible validation behavior.
