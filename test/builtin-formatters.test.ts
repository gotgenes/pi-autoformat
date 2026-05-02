import { describe, expect, it } from "vitest";

import {
  BUILTIN_FORMATTERS,
  isBuiltinFormatterName,
} from "../src/builtin-formatters.js";
import {
  type FormatterConfig,
  resolveChainSteps,
} from "../src/formatter-registry.js";

describe("builtin formatter registry", () => {
  it("registers treefmt and treefmt-nix as built-ins", () => {
    expect(BUILTIN_FORMATTERS.treefmt).toBeDefined();
    expect(BUILTIN_FORMATTERS["treefmt-nix"]).toBeDefined();
    expect(BUILTIN_FORMATTERS.treefmt.name).toBe("treefmt");
    expect(BUILTIN_FORMATTERS["treefmt-nix"].name).toBe("treefmt-nix");
  });

  it("recognizes the canonical built-in names", () => {
    expect(isBuiltinFormatterName("treefmt")).toBe(true);
    expect(isBuiltinFormatterName("treefmt-nix")).toBe(true);
    expect(isBuiltinFormatterName("prettier")).toBe(false);
    expect(isBuiltinFormatterName("nope")).toBe(false);
  });
});

describe("resolveChainSteps with built-ins", () => {
  it("resolves treefmt without a formatters entry", () => {
    const config: FormatterConfig = { formatters: {}, chains: {} };
    const resolved = resolveChainSteps(["treefmt"], config);
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.kind === "single") {
      expect(resolved[0].formatter.name).toBe("treefmt");
      expect(resolved[0].formatter.builtin).toBeDefined();
      expect(resolved[0].formatter.builtin?.name).toBe("treefmt");
    } else {
      throw new Error("expected single step");
    }
  });

  it("resolves treefmt-nix without a formatters entry", () => {
    const config: FormatterConfig = { formatters: {}, chains: {} };
    const resolved = resolveChainSteps(["treefmt-nix"], config);
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.kind === "single") {
      expect(resolved[0].formatter.builtin?.name).toBe("treefmt-nix");
    }
  });

  it("resolves built-ins inside a fallback group", () => {
    const config: FormatterConfig = { formatters: {}, chains: {} };
    const resolved = resolveChainSteps(
      [{ fallback: ["treefmt-nix", "treefmt"] }],
      config,
    );
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.kind === "fallback") {
      expect(resolved[0].alternatives.map((a) => a.name)).toEqual([
        "treefmt-nix",
        "treefmt",
      ]);
      expect(resolved[0].alternatives.every((a) => a.builtin)).toBe(true);
    }
  });

  it("prefers a user-declared formatter over the built-in (shadow allowed)", () => {
    const config: FormatterConfig = {
      formatters: {
        treefmt: { command: ["treefmt", "--ci"] },
      },
      chains: {},
    };
    const resolved = resolveChainSteps(["treefmt"], config);
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.kind === "single") {
      expect(resolved[0].formatter.command).toEqual(["treefmt", "--ci"]);
      expect(resolved[0].formatter.builtin).toBeUndefined();
    }
  });
});
