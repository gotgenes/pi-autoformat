export const extensionName = "pi-autoformat";

export {
  createFormatterConfig,
  DEFAULT_FORMATTER_CONFIG,
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
