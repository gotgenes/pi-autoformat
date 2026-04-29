import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getGlobalConfigPath,
  getProjectConfigPath,
  loadAutoformatConfig,
  validateUserFormatterConfig,
} from "../src/config-loader.js";

describe("validateUserFormatterConfig", () => {
  it("accepts $schema and known config fields", () => {
    const result = validateUserFormatterConfig({
      $schema: "https://example.com/schema.json",
      formatMode: "prompt",
      commandTimeoutMs: 5000,
      hideSummariesInTui: true,
      formatters: {
        prettier: {
          command: ["prettier", "--write", "$FILE"],
          extensions: [".TS", ".md"],
        },
      },
      chains: {
        ".MD": ["prettier"],
      },
    });

    expect(result.issues).toEqual([]);
    expect(result.config).toEqual({
      formatMode: "prompt",
      commandTimeoutMs: 5000,
      hideSummariesInTui: true,
      formatters: {
        prettier: {
          command: ["prettier", "--write", "$FILE"],
          extensions: [".ts", ".md"],
        },
      },
      chains: {
        ".md": ["prettier"],
      },
    });
  });

  it("reports invalid fields and returns only valid fragments", () => {
    const result = validateUserFormatterConfig({
      formatMode: "later",
      commandTimeoutMs: 0,
      unexpected: true,
      formatters: {
        prettier: {
          command: ["prettier", "--write", "$FILE"],
        },
      },
    });

    expect(result.config).toEqual({
      formatters: {},
    });
    expect(result.issues.map((issue) => issue.path)).toEqual([
      "formatMode",
      "commandTimeoutMs",
      "unexpected",
      "formatters.prettier.extensions",
    ]);
  });
});

describe("loadAutoformatConfig", () => {
  it("uses default config when no files exist", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-autoformat-config-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    const result = loadAutoformatConfig({ cwd, agentDir });

    expect(result.config.formatMode).toBe("prompt");
    expect(result.config.commandTimeoutMs).toBe(10000);
    expect(result.config.hideSummariesInTui).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("merges global and project config with project precedence", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-autoformat-config-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    mkdirSync(join(agentDir, "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(
      getGlobalConfigPath(agentDir),
      JSON.stringify(
        {
          formatMode: "tool",
          commandTimeoutMs: 5000,
          formatters: {
            prettier: {
              command: ["pnpm", "exec", "prettier", "--write", "$FILE"],
              extensions: [".ts", ".md"],
            },
          },
          chains: {
            ".md": ["prettier"],
          },
        },
        null,
        2,
      ),
    );

    mkdirSync(join(cwd, ".pi", "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(
      getProjectConfigPath(cwd),
      JSON.stringify(
        {
          formatMode: "prompt",
          hideSummariesInTui: true,
          formatters: {
            "markdownlint-cli2": {
              command: ["pnpm", "exec", "markdownlint-cli2", "--fix", "$FILE"],
              extensions: [".md"],
            },
          },
          chains: {
            ".md": ["prettier", "markdownlint-cli2"],
          },
        },
        null,
        2,
      ),
    );

    const result = loadAutoformatConfig({ cwd, agentDir });

    expect(result.config.formatMode).toBe("prompt");
    expect(result.config.commandTimeoutMs).toBe(5000);
    expect(result.config.hideSummariesInTui).toBe(true);
    expect(result.config.formatters.prettier?.command).toEqual([
      "pnpm",
      "exec",
      "prettier",
      "--write",
      "$FILE",
    ]);
    expect(result.config.formatters["markdownlint-cli2"]?.command).toEqual([
      "pnpm",
      "exec",
      "markdownlint-cli2",
      "--fix",
      "$FILE",
    ]);
    expect(result.config.chains[".md"]).toEqual([
      "prettier",
      "markdownlint-cli2",
    ]);
    expect(result.issues).toEqual([]);
  });

  it("loads formatScope and shellMutationDetection settings", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-autoformat-config-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    mkdirSync(join(agentDir, "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(
      getGlobalConfigPath(agentDir),
      JSON.stringify({
        formatScope: "cwd",
        shellMutationDetection: {
          enabled: true,
          snapshotGlobs: ["src/**/*.ts"],
        },
      }),
    );

    mkdirSync(join(cwd, ".pi", "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(
      getProjectConfigPath(cwd),
      JSON.stringify({
        formatScope: ["packages/a"],
        shellMutationDetection: {
          snapshotGlobs: ["docs/**/*.md"],
          wrappers: [{ prefix: "pnpm codegen", outputFormat: "lines" }],
        },
      }),
    );

    const result = loadAutoformatConfig({ cwd, agentDir });

    expect(result.issues).toEqual([]);
    expect(result.config.formatScope).toEqual(["packages/a"]);
    expect(result.config.shellMutationDetection).toEqual({
      enabled: true,
      argumentParsing: true,
      snapshotGlobs: ["docs/**/*.md"],
      wrappers: [{ prefix: "pnpm codegen", outputFormat: "lines" }],
    });
  });

  it("defaults shellMutationDetection to disabled with formatScope=repoRoot", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-autoformat-config-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    const result = loadAutoformatConfig({ cwd, agentDir });
    expect(result.config.formatScope).toBe("repoRoot");
    expect(result.config.shellMutationDetection).toEqual({
      enabled: false,
      argumentParsing: true,
      snapshotGlobs: [],
      wrappers: [],
    });
  });

  it("reports parse and validation errors without throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-autoformat-config-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    mkdirSync(join(agentDir, "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(getGlobalConfigPath(agentDir), "{not json\n");

    mkdirSync(join(cwd, ".pi", "extensions", "pi-autoformat"), {
      recursive: true,
    });
    writeFileSync(
      getProjectConfigPath(cwd),
      JSON.stringify({
        hideSummariesInTui: "yes",
      }),
    );

    const result = loadAutoformatConfig({ cwd, agentDir });

    expect(result.config.hideSummariesInTui).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.sourcePath).toBe(getGlobalConfigPath(agentDir));
    expect(result.issues[1]?.path).toBe("hideSummariesInTui");
  });
});
