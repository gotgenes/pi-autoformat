import { describe, expect, it } from "vitest";

import {
  createFormatterConfig,
  DEFAULT_FORMATTER_CONFIG,
  type UserFormatterConfig,
} from "../src/formatter-config.js";

describe("createFormatterConfig", () => {
  it("includes default formatters by default", () => {
    const config = createFormatterConfig();

    expect(Object.keys(config.formatters)).toContain("prettier");
    expect(Object.keys(config.formatters)).toContain("markdownlint-cli2");
  });

  it("allows overriding builtin formatter commands", () => {
    const userConfig: UserFormatterConfig = {
      formatters: {
        prettier: {
          command: ["pnpm", "exec", "prettier", "--write"],
          extensions: [".ts", ".md"],
        },
      },
    };

    const config = createFormatterConfig(userConfig);

    expect(config.formatters.prettier?.command).toEqual([
      "pnpm",
      "exec",
      "prettier",
      "--write",
    ]);
  });

  it("allows disabling builtin formatters", () => {
    const userConfig: UserFormatterConfig = {
      formatters: {
        prettier: {
          ...DEFAULT_FORMATTER_CONFIG.formatters.prettier,
          disabled: true,
        },
      },
    };

    const config = createFormatterConfig(userConfig);

    expect(config.formatters.prettier?.disabled).toBe(true);
  });

  it("merges chain configuration while preserving user order", () => {
    const userConfig: UserFormatterConfig = {
      chains: {
        ".md": ["markdownlint-cli2", "prettier"],
      },
    };

    const config = createFormatterConfig(userConfig);

    expect(config.chains[".md"]).toEqual(["markdownlint-cli2", "prettier"]);
  });
});
