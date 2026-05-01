import {
  type CommandProbe,
  createCachedCommandProbe,
  defaultCommandProbe,
} from "./command-probe.js";
import type { FormatScope } from "./format-scope.js";
import {
  type BatchRun,
  type CommandRunner,
  executeChainGroup,
} from "./formatter-executor.js";
import type { ChainStep } from "./formatter-registry.js";
import {
  type FormatterConfig,
  groupFilesByChain,
  resolveChainSteps,
} from "./formatter-registry.js";
import {
  type MutationSourceHandler,
  TouchedFilesQueue,
} from "./touched-files-queue.js";

export type ChainGroupResult = {
  chain: ChainStep[];
  files: string[];
  runs: BatchRun[];
};

export type PromptAutoformatterResult = {
  groups: ChainGroupResult[];
};

export type PromptAutoformatterOptions = {
  scope?: FormatScope;
  mutationHandlers?: MutationSourceHandler[];
  /**
   * Probe used to test whether a fallback alternative's command is on PATH.
   * Wrapped in a per-flush cache so the same command is probed at most once
   * per flush across all chain groups. Defaults to the synchronous PATH walker.
   */
  commandProbe?: CommandProbe;
};

export class PromptAutoformatter {
  private readonly queue: TouchedFilesQueue;
  private readonly commandProbe: CommandProbe;

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
    this.commandProbe = options?.commandProbe ?? defaultCommandProbe;
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

    // One probe cache per flush, shared across all chain groups so the same
    // fallback command is probed at most once even when many extensions share
    // the same fallback step.
    const cachedProbe = createCachedCommandProbe(this.commandProbe);

    for (const group of fileGroups) {
      const resolved = resolveChainSteps(group.chain, this.config);
      if (resolved.length === 0) {
        continue;
      }

      const runs = await executeChainGroup(
        { chain: resolved, files: group.files },
        this.runner,
        { cwd: this.cwd, commandProbe: cachedProbe },
      );

      if (runs.length === 0) {
        // E.g. a chain consisting of a single fallback group whose
        // alternatives are all absent from PATH. Drop the group so it does
        // not show up as a phantom "formatted nothing" entry downstream.
        continue;
      }

      groupResults.push({
        chain: group.chain,
        files: [...group.files],
        runs,
      });
    }

    return { groups: groupResults };
  }
}
