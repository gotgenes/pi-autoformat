import type { FormatScope } from "./format-scope.js";
import {
  type CommandRunner,
  executeFormatterChain,
  type FormatterExecutionResult,
} from "./formatter-executor.js";
import {
  type FormatterConfig,
  resolveFormatterChainForFile,
} from "./formatter-registry.js";
import {
  type MutationSourceHandler,
  TouchedFilesQueue,
} from "./touched-files-queue.js";

export type PromptAutoformatterResult = {
  files: Array<{
    path: string;
    runs: FormatterExecutionResult[];
  }>;
};

export type PromptAutoformatterOptions = {
  scope?: FormatScope;
  mutationHandlers?: MutationSourceHandler[];
};

export class PromptAutoformatter {
  private readonly queue: TouchedFilesQueue;

  constructor(
    private readonly cwd: string,
    private readonly config: FormatterConfig,
    private readonly runner: CommandRunner,
    options?: PromptAutoformatterOptions,
  ) {
    this.queue = new TouchedFilesQueue({
      cwd,
      scope: options?.scope,
      handlers: options?.mutationHandlers,
    });
  }

  recordToolResult(toolName: string, payload: unknown, output = ""): void {
    this.queue.recordToolResult(toolName, payload, output);
  }

  addTouchedPath(filePath: string): void {
    this.queue.addPath(filePath);
  }

  async flushPrompt(): Promise<PromptAutoformatterResult> {
    const touchedFiles = this.queue.flush();
    const fileResults: PromptAutoformatterResult["files"] = [];

    for (const filePath of touchedFiles) {
      const chain = resolveFormatterChainForFile(filePath, this.config);
      if (chain.length === 0) {
        continue;
      }

      const runs = await executeFormatterChain(chain, this.runner, {
        cwd: this.cwd,
      });

      fileResults.push({
        path: filePath,
        runs,
      });
    }

    return {
      files: fileResults,
    };
  }
}
