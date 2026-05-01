import { describe, expect, it } from "vitest";

import {
  type FormatterConfig,
  groupFilesByChain,
  resolveChain,
} from "../src/formatter-registry.js";

describe("groupFilesByChain", () => {
  const config: FormatterConfig = {
    formatters: {
      prettier: { command: ["prettier", "--write"], extensions: [] },
      markdownlint: { command: ["markdownlint-cli2", "--fix"], extensions: [] },
      biome: { command: ["biome", "format", "--write"], extensions: [] },
    },
    chains: {
      ".md": ["prettier", "markdownlint"],
      ".markdown": ["prettier", "markdownlint"],
      ".ts": ["prettier"],
      ".js": ["prettier"],
      ".rs": ["biome"],
    },
  };

  it("groups files that share a chain into one group", () => {
    const groups = groupFilesByChain(
      ["/repo/a.md", "/repo/b.md", "/repo/c.md"],
      config,
    );

    expect(groups).toEqual([
      {
        chain: ["prettier", "markdownlint"],
        files: ["/repo/a.md", "/repo/b.md", "/repo/c.md"],
      },
    ]);
  });

  it("creates separate groups for distinct chains", () => {
    const groups = groupFilesByChain(
      ["/repo/a.md", "/repo/b.ts", "/repo/c.rs"],
      config,
    );

    expect(groups).toEqual([
      { chain: ["prettier", "markdownlint"], files: ["/repo/a.md"] },
      { chain: ["prettier"], files: ["/repo/b.ts"] },
      { chain: ["biome"], files: ["/repo/c.rs"] },
    ]);
  });

  it("merges different extensions that resolve to the same chain", () => {
    const groups = groupFilesByChain(
      ["/repo/a.md", "/repo/b.markdown", "/repo/c.ts", "/repo/d.js"],
      config,
    );

    expect(groups).toEqual([
      {
        chain: ["prettier", "markdownlint"],
        files: ["/repo/a.md", "/repo/b.markdown"],
      },
      { chain: ["prettier"], files: ["/repo/c.ts", "/repo/d.js"] },
    ]);
  });

  it("drops files with no chain", () => {
    const groups = groupFilesByChain(
      ["/repo/a.md", "/repo/logo.png", "/repo/notes.txt"],
      config,
    );

    expect(groups).toEqual([
      { chain: ["prettier", "markdownlint"], files: ["/repo/a.md"] },
    ]);
  });

  it("preserves first-seen group order and within-group file order", () => {
    const groups = groupFilesByChain(
      ["/repo/x.ts", "/repo/a.md", "/repo/y.ts", "/repo/b.md"],
      config,
    );

    expect(groups).toEqual([
      { chain: ["prettier"], files: ["/repo/x.ts", "/repo/y.ts"] },
      {
        chain: ["prettier", "markdownlint"],
        files: ["/repo/a.md", "/repo/b.md"],
      },
    ]);
  });

  it("returns no groups when given no files", () => {
    expect(groupFilesByChain([], config)).toEqual([]);
  });
});

describe("resolveChain", () => {
  const config: FormatterConfig = {
    formatters: {
      prettier: {
        command: ["prettier", "--write"],
        extensions: [".md"],
        environment: { PRETTIERD_DEFAULT_CONFIG: "./.prettierrc" },
      },
      markdownlint: {
        command: ["markdownlint-cli2", "--fix"],
        extensions: [".md"],
      },
      disabled: {
        command: ["never"],
        extensions: [".md"],
        disabled: true,
      },
    },
    chains: {},
  };

  it("resolves formatters in declared order", () => {
    const resolved = resolveChain(["prettier", "markdownlint"], config);

    expect(resolved.map((entry) => entry.name)).toEqual([
      "prettier",
      "markdownlint",
    ]);
  });

  it("returns the configured command verbatim (no $FILE substitution)", () => {
    const resolved = resolveChain(["prettier"], config);

    expect(resolved[0]?.command).toEqual(["prettier", "--write"]);
  });

  it("propagates the formatter environment", () => {
    const resolved = resolveChain(["prettier"], config);

    expect(resolved[0]?.environment).toEqual({
      PRETTIERD_DEFAULT_CONFIG: "./.prettierrc",
    });
  });

  it("skips disabled formatters", () => {
    const resolved = resolveChain(
      ["prettier", "disabled", "markdownlint"],
      config,
    );

    expect(resolved.map((entry) => entry.name)).toEqual([
      "prettier",
      "markdownlint",
    ]);
  });

  it("skips unknown formatter names", () => {
    const resolved = resolveChain(["prettier", "nonexistent"], config);

    expect(resolved.map((entry) => entry.name)).toEqual(["prettier"]);
  });

  it("returns an empty array for an empty chain", () => {
    expect(resolveChain([], config)).toEqual([]);
  });
});
