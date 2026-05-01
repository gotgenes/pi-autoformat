import type { CustomMutationToolSpec } from "./custom-mutation-tools.js";
import type { FormatScopeSetting } from "./format-scope.js";
import type {
  FormatterConfig,
  FormatterDefinition,
} from "./formatter-registry.js";
import {
  DEFAULT_SHELL_MUTATION_DETECTION,
  type ShellMutationDetectionConfig,
} from "./shell-mutation-detector.js";

export type FormatMode = "tool" | "prompt" | "session";

export type EventBusMutationChannelConfig = {
  enabled: boolean;
  channel: string;
};

export const DEFAULT_EVENT_BUS_MUTATION_CHANNEL: EventBusMutationChannelConfig =
  {
    enabled: true,
    channel: "autoformat:touched",
  };

export type UserFormatterConfig = {
  formatMode?: FormatMode;
  commandTimeoutMs?: number;
  hideSummariesInTui?: boolean;
  formatScope?: FormatScopeSetting;
  shellMutationDetection?: Partial<ShellMutationDetectionConfig>;
  customMutationTools?: CustomMutationToolSpec[];
  eventBusMutationChannel?: Partial<EventBusMutationChannelConfig>;
  formatters?: Record<string, FormatterDefinition>;
  chains?: Record<string, string[]>;
};

export type AutoformatConfig = FormatterConfig & {
  formatMode: FormatMode;
  commandTimeoutMs: number;
  hideSummariesInTui: boolean;
  formatScope: FormatScopeSetting;
  shellMutationDetection: ShellMutationDetectionConfig;
  customMutationTools: CustomMutationToolSpec[];
  eventBusMutationChannel: EventBusMutationChannelConfig;
  formatters: Record<string, FormatterDefinition>;
  chains: Record<string, string[]>;
};

export const DEFAULT_FORMATTER_CONFIG: AutoformatConfig = {
  formatMode: "prompt",
  commandTimeoutMs: 10000,
  hideSummariesInTui: false,
  formatScope: "repoRoot",
  shellMutationDetection: DEFAULT_SHELL_MUTATION_DETECTION,
  customMutationTools: [],
  eventBusMutationChannel: DEFAULT_EVENT_BUS_MUTATION_CHANNEL,
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
    formatScope:
      userConfig?.formatScope ?? DEFAULT_FORMATTER_CONFIG.formatScope,
    shellMutationDetection: {
      ...DEFAULT_FORMATTER_CONFIG.shellMutationDetection,
      ...userConfig?.shellMutationDetection,
    },
    customMutationTools:
      userConfig?.customMutationTools ??
      DEFAULT_FORMATTER_CONFIG.customMutationTools,
    eventBusMutationChannel: {
      ...DEFAULT_FORMATTER_CONFIG.eventBusMutationChannel,
      ...userConfig?.eventBusMutationChannel,
    },
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
