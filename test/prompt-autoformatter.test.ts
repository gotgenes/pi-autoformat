import { describe, expect, it } from "vitest";
import type { CommandRunner } from "../src/formatter-executor.js";
import type { FormatterConfig } from "../src/formatter-registry.js";
import { PromptAutoformatter } from "../src/prompt-autoformatter.js";

describe("PromptAutoformatter", () => {
  const config: FormatterConfig = {
    formatters: {
      prettier: {
        command: ["prettier", "--write"],
        extensions: [".ts", ".md"],
      },
      markdownlint: {
        command: ["markdownlint-cli2", "--fix"],
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
    expect(result).toEqual({ groups: [] });
  });

  it("dedupes touched files and runs each chain step once per group", async () => {
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
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].files).toEqual(["/repo/docs/readme.md"]);
    expect(result.groups[0].chain).toEqual(["prettier", "markdownlint"]);
  });

  it("batches multiple files that share a chain into a single invocation per step", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0 };
    };

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "docs/a.md" });
    formatter.recordToolResult("write", { path: "docs/b.md" });

    const result = await formatter.flushPrompt();

    expect(calls).toEqual([
      {
        command: "prettier",
        args: ["--write", "/repo/docs/a.md", "/repo/docs/b.md"],
      },
      {
        command: "markdownlint-cli2",
        args: ["--fix", "/repo/docs/a.md", "/repo/docs/b.md"],
      },
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].files).toEqual([
      "/repo/docs/a.md",
      "/repo/docs/b.md",
    ]);
  });

  it("produces one group per distinct chain", async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0 });

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "src/index.ts" });
    formatter.recordToolResult("write", { path: "docs/readme.md" });

    const result = await formatter.flushPrompt();

    expect(result.groups.map((g) => g.chain)).toEqual([
      ["prettier"],
      ["prettier", "markdownlint"],
    ]);
  });

  it("returns formatter failures per batch without throwing", async () => {
    const runner: CommandRunner = async (command) => {
      if (command === "prettier") {
        return { exitCode: 2, stderr: "parse error" };
      }
      return { exitCode: 0 };
    };

    const formatter = new PromptAutoformatter("/repo", config, runner);
    formatter.recordToolResult("write", { path: "docs/readme.md" });

    const result = await formatter.flushPrompt();
    const group = result.groups[0];

    expect(group.files).toEqual(["/repo/docs/readme.md"]);
    expect(group.runs[0]).toMatchObject({
      formatterName: "prettier",
      success: false,
      exitCode: 2,
      files: ["/repo/docs/readme.md"],
    });
    expect(group.runs[1]).toMatchObject({
      formatterName: "markdownlint",
      success: true,
      exitCode: 0,
    });
  });
});
