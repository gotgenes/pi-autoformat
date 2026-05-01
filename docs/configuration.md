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

### `formatScope`

Boundary used to filter the touched-files queue. Paths outside the configured
scope are dropped silently.

Allowed values:

- `"repoRoot"` (default) — detect the Git toplevel via
  `git rev-parse --show-toplevel` and use it as the scope. Falls back to `cwd`
  when not in a Git repo.
- `"cwd"` — strict cwd subtree.
- `string[]` — explicit allowlist of roots, each resolved relative to `cwd`.
  A path is in scope if it falls under any configured root.

Symlinks are resolved on both sides via `fs.realpath`, so a symlinked workspace
dep that resolves outside the scope is correctly filtered, and a symlink
pointing into the scope is correctly included.

Example:

```json
{
  "formatScope": ["packages/server", "packages/shared"]
}
```

### `shellMutationDetection`

Opt-in detection of files mutated by shell (`bash`) commands. Disabled by
default; enable to surface files touched by `sed -i`, `mv`, `cp`, `touch`,
`tee`, redirections, or user-declared codegen wrappers.

Defaults:

```json
{
  "shellMutationDetection": {
    "enabled": false,
    "argumentParsing": true,
    "snapshotGlobs": [],
    "wrappers": []
  }
}
```

Fields:

- `enabled` — master switch. Defaults to `false`.
- `argumentParsing` — parse a small whitelist of known mutating commands
  (`sed -i`, `mv`, `cp`, `touch`, `tee`, plus simple `>` / `>>`
  redirections). Bails on pipelines, command substitutions, sequencing, and
  unknown flags so the surface stays auditable.
- `snapshotGlobs` — globs whose mtimes are sampled before and after each
  `bash` invocation. Files whose mtime advanced are treated as touched.
  Capped at 5,000 entries with a warning on overflow. Defaults to `[]`.
- `wrappers` — shell command prefixes that already print the files they
  touched on stdout. Each entry has a `prefix` (matched at the start of the
  bash command) and optional `outputFormat` (currently only `"lines"`).

Example:

```json
{
  "shellMutationDetection": {
    "enabled": true,
    "snapshotGlobs": ["src/**/*.ts", "docs/**/*.md"],
    "wrappers": [{ "prefix": "pnpm codegen", "outputFormat": "lines" }]
  }
}
```

Merge semantics: `snapshotGlobs` and `wrappers` arrays replace lower-precedence
values rather than merging — consistent with other array fields in this config.

### `customMutationTools`

Declare additional tool names whose results should be treated as file
mutations and routed into the touched-files queue. Useful for project- or
extension-specific tools that the agent calls directly.

Each entry must specify the tool name and exactly one of `pathField` or
`pathFields`, each a dotted path into the tool's `input` payload. A field
may resolve to a string or a string array; arrays are flattened.

Defaults to `[]`.

Example:

```json
{
  "customMutationTools": [
    { "toolName": "my-codegen", "pathField": "output" },
    { "toolName": "refactor", "pathFields": ["src", "dest"] }
  ]
}
```

Paths are normalized and scope-filtered by the same pipeline used for
`write`/`edit`, so you do not need to restate scope rules per tool.

### `eventBusMutationChannel`

Lets peer extensions publish touched files onto Pi's shared event bus and
have them flow through the same prompt-end formatter pipeline.

Defaults:

```json
{
  "eventBusMutationChannel": {
    "enabled": true,
    "channel": "autoformat:touched"
  }
}
```

Fields:

- `enabled` — subscribe to the channel when Pi exposes `pi.events`.
  Defaults to `true`.
- `channel` — channel name to subscribe to. Defaults to `"autoformat:touched"`.

Payload shape (best-effort; malformed payloads are silently ignored):

```ts
{ path: string }            // single file
{ paths: string[] }         // multiple files
```

Paths are resolved relative to the session `cwd` and pass through the same
scope filter as every other mutation source.

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

For v1, formatter execution is driven by explicit `chains` only.
If an extension has no `chains` entry, `pi-autoformat` does not run any formatter for that extension.

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
