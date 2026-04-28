import {
  type CommandRunner,
  executeFormatterChain,
  type FormatterExecutionResult,
} from "./formatter-executor.js";
import {
  type FormatterConfig,
  resolveFormatterChainForFile,
} from "./formatter-registry.js";
import { TouchedFilesQueue } from "./touched-files-queue.js";

export type PromptAutoformatterResult = {
  files: Array<{
    path: string;
    runs: FormatterExecutionResult[];
  }>;
};

export class PromptAutoformatter {
  private readonly queue: TouchedFilesQueue;

  constructor(
    private readonly cwd: string,
    private readonly config: FormatterConfig,
    private readonly runner: CommandRunner,
  ) {
    this.queue = new TouchedFilesQueue(cwd);
  }

  recordToolResult(toolName: string, payload: unknown): void {
    this.queue.recordToolResult(toolName, payload);
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
