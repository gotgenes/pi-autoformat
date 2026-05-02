export const extensionName = "pi-autoformat";

export {
  AUTOFORMAT_CONFIG_FILE_NAME,
  AUTOFORMAT_EXTENSION_ID,
  type ConfigValidationIssue,
  getGlobalConfigPath,
  getProjectConfigPath,
  type LoadConfigResult,
  loadAutoformatConfig,
  type ValidateConfigResult,
  validateUserFormatterConfig,
} from "./config-loader.js";
export {
  createAutoformatExtension,
  default as autoformatExtension,
} from "./extension.js";
export {
  type FormatScope,
  type FormatScopeSetting,
  isInFormatScope,
  resolveFormatScope,
} from "./format-scope.js";
export {
  type AutoformatConfig,
  createFormatterConfig,
  DEFAULT_FORMATTER_CONFIG,
  type UserFormatterConfig,
} from "./formatter-config.js";
export {
  type BatchRun,
  type ChainGroupInput,
  type CommandRunner,
  type CommandRunnerOptions,
  type CommandRunResult,
  executeChainGroup,
} from "./formatter-executor.js";
export {
  type ChainGroup,
  type FormatterConfig,
  type FormatterDefinition,
  groupFilesByChain,
  type ResolvedFormatter,
  resolveChain,
} from "./formatter-registry.js";
export {
  type ChainGroupResult,
  PromptAutoformatter,
  type PromptAutoformatterResult,
} from "./prompt-autoformatter.js";
export {
  DEFAULT_SHELL_MUTATION_DETECTION,
  matchWrapper,
  parseKnownCommand,
  type ShellMutationDetectionConfig,
  SnapshotTracker,
  type WrapperConfig,
} from "./shell-mutation-detector.js";
export {
  type MutationSourceHandler,
  TouchedFilesQueue,
  writeOrEditHandler,
} from "./touched-files-queue.js";
