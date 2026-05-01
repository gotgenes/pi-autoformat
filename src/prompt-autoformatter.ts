import type { FormatScope } from "./format-scope.js";
import {
  type BatchRun,
  type CommandRunner,
  executeChainGroup,
} from "./formatter-executor.js";
import {
  type FormatterConfig,
  groupFilesByChain,
  resolveChain,
} from "./formatter-registry.js";
import {
  type MutationSourceHandler,
  TouchedFilesQueue,
} from "./touched-files-queue.js";

export type ChainGroupResult = {
  chain: string[];
  files: string[];
  runs: BatchRun[];
};

export type PromptAutoformatterResult = {
  groups: ChainGroupResult[];
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
    const fileGroups = groupFilesByChain(touchedFiles, this.config);
    const groupResults: ChainGroupResult[] = [];

    for (const group of fileGroups) {
      const resolved = resolveChain(group.chain, this.config);
      if (resolved.length === 0) {
        continue;
      }

      const runs = await executeChainGroup(
        { chain: resolved, files: group.files },
        this.runner,
        { cwd: this.cwd },
      );

      groupResults.push({
        chain: group.chain,
        files: [...group.files],
        runs,
      });
    }

    return { groups: groupResults };
  }
}
