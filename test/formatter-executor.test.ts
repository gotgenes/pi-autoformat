import { describe, expect, it } from "vitest";

import {
  type CommandRunner,
  executeChainGroup,
} from "../src/formatter-executor.js";
import type { ResolvedFormatter } from "../src/formatter-registry.js";

describe("executeChainGroup", () => {
  const chain: ResolvedFormatter[] = [
    {
      name: "prettier",
      command: ["prettier", "--write"],
      environment: { PRETTIERD_DEFAULT_CONFIG: "./.prettierrc" },
    },
    {
      name: "markdownlint",
      command: ["markdownlint-cli2", "--fix"],
    },
  ];

  it("runs each step once with all files appended as trailing args", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0 };
    };

    const runs = await executeChainGroup(
      { chain, files: ["/repo/a.md", "/repo/b.md"] },
      runner,
    );

    expect(calls).toEqual([
      {
        command: "prettier",
        args: ["--write", "/repo/a.md", "/repo/b.md"],
      },
      {
        command: "markdownlint-cli2",
        args: ["--fix", "/repo/a.md", "/repo/b.md"],
      },
    ]);
    expect(runs).toEqual([
      {
        formatterName: "prettier",
        command: ["prettier", "--write", "/repo/a.md", "/repo/b.md"],
        files: ["/repo/a.md", "/repo/b.md"],
        success: true,
        exitCode: 0,
        stdout: undefined,
        stderr: undefined,
      },
      {
        formatterName: "markdownlint",
        command: [
          "markdownlint-cli2",
          "--fix",
          "/repo/a.md",
          "/repo/b.md",
        ],
        files: ["/repo/a.md", "/repo/b.md"],
        success: true,
        exitCode: 0,
        stdout: undefined,
        stderr: undefined,
      },
    ]);
  });

  it("works with a single-file batch", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { exitCode: 0 };
    };

    await executeChainGroup(
      { chain: [chain[0]], files: ["/repo/only.md"] },
      runner,
    );

    expect(calls).toEqual([["prettier", "--write", "/repo/only.md"]]);
  });

  it("continues running remaining steps after a step fails", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (command) => {
      calls.push(command);
      if (command === "prettier") {
        return { exitCode: 2, stderr: "boom" };
      }
      return { exitCode: 0 };
    };

    const runs = await executeChainGroup(
      { chain, files: ["/repo/a.md"] },
      runner,
    );

    expect(calls).toEqual(["prettier", "markdownlint-cli2"]);
    expect(runs[0]).toMatchObject({
      formatterName: "prettier",
      success: false,
      exitCode: 2,
      stderr: "boom",
      files: ["/repo/a.md"],
    });
    expect(runs[1]).toMatchObject({
      formatterName: "markdownlint",
      success: true,
      exitCode: 0,
    });
  });

  it("propagates formatter environment overrides", async () => {
    let capturedEnv: Record<string, string> | undefined;
    const runner: CommandRunner = async (_command, _args, options) => {
      capturedEnv = options?.env;
      return { exitCode: 0 };
    };

    await executeChainGroup(
      { chain: [chain[0]], files: ["/repo/a.md"] },
      runner,
    );

    expect(capturedEnv).toMatchObject({
      PRETTIERD_DEFAULT_CONFIG: "./.prettierrc",
    });
  });

  it("forwards cwd to the runner", async () => {
    let capturedCwd: string | undefined;
    const runner: CommandRunner = async (_command, _args, options) => {
      capturedCwd = options?.cwd;
      return { exitCode: 0 };
    };

    await executeChainGroup(
      { chain: [chain[0]], files: ["/repo/a.md"] },
      runner,
      { cwd: "/repo" },
    );

    expect(capturedCwd).toBe("/repo");
  });

  it("marks a step as failed with exit 1 when its command is empty", async () => {
    const runner: CommandRunner = async () => {
      throw new Error("should not be called");
    };

    const runs = await executeChainGroup(
      {
        chain: [{ name: "broken", command: [] }],
        files: ["/repo/a.md"],
      },
      runner,
    );

    expect(runs[0]).toMatchObject({
      formatterName: "broken",
      success: false,
      exitCode: 1,
      files: ["/repo/a.md"],
    });
    expect(runs[0].stderr).toMatch(/empty/i);
  });

  it("returns no runs when files is empty", async () => {
    const runner: CommandRunner = async () => {
      throw new Error("should not be called");
    };

    const runs = await executeChainGroup({ chain, files: [] }, runner);

    expect(runs).toEqual([]);
  });
});
