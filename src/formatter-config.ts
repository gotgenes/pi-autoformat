import type {
  FormatterConfig,
  FormatterDefinition,
} from "./formatter-registry.js";

export type FormatMode = "tool" | "prompt" | "session";

export type UserFormatterConfig = {
  formatMode?: FormatMode;
  commandTimeoutMs?: number;
  hideSummariesInTui?: boolean;
  formatters?: Record<string, FormatterDefinition>;
  chains?: Record<string, string[]>;
};

export type AutoformatConfig = FormatterConfig & {
  formatMode: FormatMode;
  commandTimeoutMs: number;
  hideSummariesInTui: boolean;
};

export const DEFAULT_FORMATTER_CONFIG: AutoformatConfig = {
  formatMode: "prompt",
  commandTimeoutMs: 10000,
  hideSummariesInTui: false,
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

export function createFormatterConfig(
  userConfig?: UserFormatterConfig,
): AutoformatConfig {
  return {
    formatMode: userConfig?.formatMode ?? DEFAULT_FORMATTER_CONFIG.formatMode,
    commandTimeoutMs:
      userConfig?.commandTimeoutMs ?? DEFAULT_FORMATTER_CONFIG.commandTimeoutMs,
    hideSummariesInTui:
      userConfig?.hideSummariesInTui ??
      DEFAULT_FORMATTER_CONFIG.hideSummariesInTui,
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
