import { describe, expect, it } from "vitest";
import type { CommandRunner } from "../src/formatter-executor.js";
import type { FormatterConfig } from "../src/formatter-registry.js";
import {
  PromptAutoformatter,
  type PromptAutoformatterResult,
} from "../src/prompt-autoformatter.js";

describe("PromptAutoformatter", () => {
  const config: FormatterConfig = {
    formatters: {
      prettier: {
        command: ["prettier", "--write", "$FILE"],
        extensions: [".ts", ".md"],
      },
      markdownlint: {
        command: ["markdownlint-cli2", "--fix", "$FILE"],
        extensions: [".md"],
      },
    },
    chains: {
      ".md": ["prettier", "markdownlint"],
      ".ts": ["prettier"],
    },
  };

  it("is a no-op when no formatter matches touched files", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      return { exitCode: 0 };
    };

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "assets/logo.png" });

    const result = await formatter.flushPrompt();

    expect(calls).toEqual([]);
    expect(result).toEqual({ files: [] });
  });

  it("dedupes touched files across prompt tool results", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      return { exitCode: 0 };
    };

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "docs/readme.md" });
    formatter.recordToolResult("edit", { path: "./docs/readme.md" });

    const result = await formatter.flushPrompt();

    expect(calls).toEqual([
      "prettier --write /repo/docs/readme.md",
      "markdownlint-cli2 --fix /repo/docs/readme.md",
    ]);
    expect(result.files).toHaveLength(1);
  });

  it("returns formatter failures without throwing", async () => {
    const runner: CommandRunner = async (command) => {
      if (command === "prettier") {
        return {
          exitCode: 2,
          stderr: "parse error",
        };
      }
      return { exitCode: 0 };
    };

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "docs/readme.md" });

    const result = await formatter.flushPrompt();
    const firstFile = result
      .files[0] as PromptAutoformatterResult["files"][number];

    expect(firstFile.path).toBe("/repo/docs/readme.md");
    expect(firstFile.runs[0]).toMatchObject({
      formatterName: "prettier",
      success: false,
      exitCode: 2,
    });
    expect(firstFile.runs[1]).toMatchObject({
      formatterName: "markdownlint",
      success: true,
      exitCode: 0,
    });
  });
});
