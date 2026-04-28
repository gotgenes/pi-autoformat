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
  type AutoformatConfig,
  createFormatterConfig,
  DEFAULT_FORMATTER_CONFIG,
  type FormatMode,
  type UserFormatterConfig,
} from "./formatter-config.js";
export {
  type CommandRunner,
  type CommandRunnerOptions,
  type CommandRunResult,
  executeFormatterChain,
  type FormatterExecutionResult,
} from "./formatter-executor.js";
export {
  type FormatterConfig,
  type FormatterDefinition,
  type ResolvedFormatter,
  resolveFormatterChainForFile,
} from "./formatter-registry.js";
export {
  PromptAutoformatter,
  type PromptAutoformatterResult,
} from "./prompt-autoformatter.js";
export { TouchedFilesQueue } from "./touched-files-queue.js";
