import { describe, expect, it } from "vitest";

import {
  type CommandRunner,
  executeFormatterChain,
} from "../src/formatter-executor.js";
import type { ResolvedFormatter } from "../src/formatter-registry.js";

describe("executeFormatterChain", () => {
  const chain: ResolvedFormatter[] = [
    {
      name: "prettier",
      command: ["prettier", "--write", "/repo/docs/readme.md"],
      environment: {
        PRETTIERD_DEFAULT_CONFIG: "./.prettierrc",
      },
    },
    {
      name: "markdownlint",
      command: ["markdownlint-cli2", "--fix", "/repo/docs/readme.md"],
    },
  ];

  it("executes formatters in order", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      return { exitCode: 0 };
    };

    const result = await executeFormatterChain(chain, runner);

    expect(calls).toEqual([
      "prettier --write /repo/docs/readme.md",
      "markdownlint-cli2 --fix /repo/docs/readme.md",
    ]);
    expect(result.every((entry) => entry.success)).toBe(true);
  });

  it("continues running remaining formatters after a failure", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (command, _args) => {
      calls.push(command);
      if (command === "prettier") {
        return {
          exitCode: 2,
          stderr: "syntax error",
        };
      }

      return { exitCode: 0 };
    };

    const result = await executeFormatterChain(chain, runner);

    expect(calls).toEqual(["prettier", "markdownlint-cli2"]);
    expect(result[0]).toMatchObject({
      formatterName: "prettier",
      success: false,
      exitCode: 2,
    });
    expect(result[1]).toMatchObject({
      formatterName: "markdownlint",
      success: true,
      exitCode: 0,
    });
  });

  it("passes formatter environment overrides to the runner", async () => {
    let capturedEnv: Record<string, string> | undefined;
    const runner: CommandRunner = async (_command, _args, options) => {
      capturedEnv = options?.env;
      return { exitCode: 0 };
    };

    await executeFormatterChain([chain[0]], runner);

    expect(capturedEnv).toMatchObject({
      PRETTIERD_DEFAULT_CONFIG: "./.prettierrc",
    });
  });
});
