import type {
  FormatterConfig,
  FormatterDefinition,
} from "./formatter-registry.js";

export const DEFAULT_FORMATTER_CONFIG: FormatterConfig = {
  formatters: {
    prettier: {
      command: ["prettier", "--write", "$FILE"],
      extensions: [
        ".js",
        ".cjs",
        ".mjs",
        ".jsx",
        ".ts",
        ".tsx",
        ".json",
        ".md",
        ".yaml",
        ".yml",
      ],
    },
    "markdownlint-cli2": {
      command: ["markdownlint-cli2", "--fix", "$FILE"],
      extensions: [".md"],
    },
  },
  chains: {
    ".md": ["prettier", "markdownlint-cli2"],
    ".js": ["prettier"],
    ".cjs": ["prettier"],
    ".mjs": ["prettier"],
    ".jsx": ["prettier"],
    ".ts": ["prettier"],
    ".tsx": ["prettier"],
    ".json": ["prettier"],
    ".yaml": ["prettier"],
    ".yml": ["prettier"],
  },
};

export type UserFormatterConfig = {
  formatters?: Record<string, FormatterDefinition>;
  chains?: Record<string, string[]>;
};

export function createFormatterConfig(
  userConfig?: UserFormatterConfig,
): FormatterConfig {
  return {
    formatters: {
      ...DEFAULT_FORMATTER_CONFIG.formatters,
      ...userConfig?.formatters,
    },
    chains: {
      ...DEFAULT_FORMATTER_CONFIG.chains,
      ...userConfig?.chains,
    },
  };
}
