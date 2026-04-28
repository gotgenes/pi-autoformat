export const extensionName = "pi-autoformat";

export {
  type FormatterConfig,
  type FormatterDefinition,
  type ResolvedFormatter,
  resolveFormatterChainForFile,
} from "./formatter-registry.js";
export { TouchedFilesQueue } from "./touched-files-queue.js";
