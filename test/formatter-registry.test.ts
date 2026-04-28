import { describe, expect, it } from "vitest";

import {
  type FormatterConfig,
  resolveFormatterChainForFile,
} from "../src/formatter-registry.js";

describe("resolveFormatterChainForFile", () => {
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
    },
  };

  it("resolves explicit chains in declared order", () => {
    const chain = resolveFormatterChainForFile("/repo/docs/readme.md", config);

    expect(chain.map((entry) => entry.name)).toEqual([
      "prettier",
      "markdownlint",
    ]);
  });

  it("returns an empty chain when no explicit chain exists for the extension", () => {
    const chain = resolveFormatterChainForFile("/repo/src/index.ts", config);

    expect(chain).toEqual([]);
  });

  it("substitutes $FILE in formatter commands", () => {
    const chain = resolveFormatterChainForFile("/repo/docs/readme.md", config);

    expect(chain[0]?.command).toEqual([
      "prettier",
      "--write",
      "/repo/docs/readme.md",
    ]);
  });

  it("skips disabled formatters", () => {
    const withDisabled: FormatterConfig = {
      ...config,
      formatters: {
        ...config.formatters,
        markdownlint: {
          ...config.formatters.markdownlint,
          disabled: true,
        },
      },
    };

    const chain = resolveFormatterChainForFile(
      "/repo/docs/readme.md",
      withDisabled,
    );

    expect(chain.map((entry) => entry.name)).toEqual(["prettier"]);
  });

  it("returns an empty chain when no formatter matches", () => {
    const chain = resolveFormatterChainForFile("/repo/assets/logo.png", config);

    expect(chain).toEqual([]);
  });
});
