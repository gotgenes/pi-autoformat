import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  AUTOFORMAT_EXTENSION_ID,
  type ConfigValidationIssue,
  type LoadConfigResult,
  loadAutoformatConfig,
} from "./config-loader.js";
import {
  createCustomToolHandlers,
  parseTouchedPayload,
} from "./custom-mutation-tools.js";
import { resolveFormatScope } from "./format-scope.js";
import type { AutoformatConfig } from "./formatter-config.js";
import type { CommandRunner, CommandRunResult } from "./formatter-executor.js";
import {
  PromptAutoformatter,
  type PromptAutoformatterResult,
} from "./prompt-autoformatter.js";
import {
  matchWrapper,
  parseKnownCommand,
  SnapshotTracker,
} from "./shell-mutation-detector.js";
import {
  type MutationSourceHandler,
  writeOrEditHandler,
} from "./touched-files-queue.js";

const execFileAsync = promisify(execFile);
const COMMAND_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

type NotificationType = "info" | "warning" | "error";

type ExtensionContextLike = {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify(message: string, type?: NotificationType): void;
  };
};

type TextContentLike = { type?: string; text?: string };

type ToolResultEventLike = {
  toolName: string;
  input: unknown;
  isError: boolean;
  /** Optional output content from the tool. Bash provides stdout text here. */
  content?: TextContentLike[];
};

type ToolCallEventLike = {
  toolName: string;
  input: unknown;
};

type ExtensionHandler<TEvent> = (
  event: TEvent,
  ctx: ExtensionContextLike,
) => void | Promise<void>;

export type ExtensionApiLike = {
  on(eventName: "session_start", handler: ExtensionHandler<unknown>): void;
  on(
    eventName: "tool_call",
    handler: ExtensionHandler<ToolCallEventLike>,
  ): void;
  on(
    eventName: "tool_result",
    handler: ExtensionHandler<ToolResultEventLike>,
  ): void;
  on(eventName: "agent_end", handler: ExtensionHandler<unknown>): void;
  on(eventName: "session_shutdown", handler: ExtensionHandler<unknown>): void;
  events?: {
    on(channel: string, handler: (data: unknown) => void): () => void;
  };
};

type PromptAutoformatterLike = Pick<
  PromptAutoformatter,
  "recordToolResult" | "flushPrompt" | "addTouchedPath"
>;

type AutoformatExtensionDependencies = {
  loadConfig?: (cwd: string) => LoadConfigResult;
  createAutoformatter?: (
    cwd: string,
    config: AutoformatConfig,
  ) => PromptAutoformatterLike;
  reportFlushResult?: (
    result: PromptAutoformatterResult,
    options: {
      config: AutoformatConfig;
      ctx: ExtensionContextLike;
    },
  ) => void;
  reportConfigIssues?: (
    issues: ConfigValidationIssue[],
    options: {
      ctx: ExtensionContextLike;
    },
  ) => void;
};

type SessionState = {
  cwd: string;
  loadResult: LoadConfigResult;
  autoformatter: PromptAutoformatterLike;
  snapshotTracker: SnapshotTracker | undefined;
  unsubscribeEventBus: (() => void) | undefined;
};

type ExecFileError = Error & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function toOutputText(value: string | Buffer | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : value.toString("utf-8");
}

function normalizeExecError(error: unknown): CommandRunResult {
  if (!(error instanceof Error)) {
    return {
      exitCode: 1,
      stderr: String(error),
    };
  }

  const execError = error as ExecFileError;
  return {
    exitCode: typeof execError.code === "number" ? execError.code : 1,
    stdout: toOutputText(execError.stdout),
    stderr: toOutputText(execError.stderr) ?? execError.message,
  };
}

function createCommandRunner(commandTimeoutMs: number): CommandRunner {
  return async (
    command: string,
    args: string[],
    options,
  ): Promise<CommandRunResult> => {
    try {
      const result = await execFileAsync(command, args, {
        cwd: options?.cwd,
        env: options?.env
          ? {
              ...process.env,
              ...options.env,
            }
          : process.env,
        encoding: "utf-8",
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        timeout: commandTimeoutMs,
      });

      return {
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      return normalizeExecError(error);
    }
  };
}

export function createDefaultAutoformatter(
  cwd: string,
  config: AutoformatConfig,
): PromptAutoformatterLike {
  const scope = resolveFormatScope({ cwd, setting: config.formatScope });
  const handlers: MutationSourceHandler[] = [writeOrEditHandler];

  if (config.customMutationTools.length > 0) {
    handlers.push(...createCustomToolHandlers(config.customMutationTools));
  }

  if (config.shellMutationDetection.enabled) {
    handlers.push(createBashMutationHandler(config));
  }

  return new PromptAutoformatter(
    cwd,
    config,
    createCommandRunner(config.commandTimeoutMs),
    { scope, mutationHandlers: handlers },
  );
}

function createBashMutationHandler(
  config: AutoformatConfig,
): MutationSourceHandler {
  const detection = config.shellMutationDetection;
  return (toolName, payload, output) => {
    if (toolName !== "bash") {
      return [];
    }
    const command = extractBashCommand(payload);
    if (!command) {
      return [];
    }
    const candidates: string[] = [];
    if (detection.argumentParsing) {
      candidates.push(...parseKnownCommand(command));
    }
    if (detection.wrappers.length > 0) {
      candidates.push(...matchWrapper(command, output, detection.wrappers));
    }
    return candidates;
  };
}

function extractBashCommand(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "command" in payload &&
    typeof (payload as { command: unknown }).command === "string"
  ) {
    return (payload as { command: string }).command;
  }
  return undefined;
}

function subscribeToEventBus(
  pi: ExtensionApiLike,
  config: AutoformatConfig,
  autoformatter: PromptAutoformatterLike,
): (() => void) | undefined {
  const channelConfig = config.eventBusMutationChannel;
  if (!channelConfig.enabled || !pi.events) {
    return undefined;
  }
  return pi.events.on(channelConfig.channel, (data: unknown) => {
    const paths = parseTouchedPayload(data);
    for (const candidate of paths) {
      autoformatter.addTouchedPath(candidate);
    }
  });
}

function extractToolOutputText(content: TextContentLike[] | undefined): string {
  if (!content) {
    return "";
  }
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("\n");
}

function reportMessage(
  ctx: ExtensionContextLike,
  message: string,
  type: NotificationType,
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
    return;
  }

  const output = `[${AUTOFORMAT_EXTENSION_ID}] ${message}`;
  if (type === "error" || type === "warning") {
    console.warn(output);
    return;
  }

  console.log(output);
}

type FailureSummary = {
  lines: string[];
  failedBatchCount: number;
};

function formatterLabel(
  name: string,
  fallbackContext?: { skipped: string[] },
): string {
  if (!fallbackContext || fallbackContext.skipped.length === 0) {
    return name;
  }
  return `${name} (fallback after ${fallbackContext.skipped.join(", ")} unavailable)`;
}

function summarizeFailures(result: PromptAutoformatterResult): FailureSummary {
  const lines: string[] = [];
  let failedBatchCount = 0;

  for (const group of result.groups) {
    for (const run of group.runs) {
      if (run.success) {
        continue;
      }
      failedBatchCount += 1;
      lines.push(
        `${formatterLabel(run.formatterName, run.fallbackContext)} (exit ${run.exitCode}): ${run.files.join(", ")}`,
      );
    }
  }

  return { lines, failedBatchCount };
}

function summarizeFallbackUsages(result: PromptAutoformatterResult): string[] {
  const lines: string[] = [];
  for (const group of result.groups) {
    for (const run of group.runs) {
      if (!run.success) {
        continue;
      }
      if (!run.fallbackContext || run.fallbackContext.skipped.length === 0) {
        continue;
      }
      lines.push(formatterLabel(run.formatterName, run.fallbackContext));
    }
  }
  return lines;
}

function collectAllFiles(result: PromptAutoformatterResult): string[] {
  const files: string[] = [];
  for (const group of result.groups) {
    files.push(...group.files);
  }
  return files;
}

function summarizeSuccessPaths(files: string[]): string | undefined {
  if (files.length === 0 || files.length > 3) {
    return undefined;
  }
  return files.join(", ");
}

function defaultReportFlushResult(
  result: PromptAutoformatterResult,
  options: {
    config: AutoformatConfig;
    ctx: ExtensionContextLike;
  },
): void {
  if (result.groups.length === 0) {
    return;
  }

  const failureSummary = summarizeFailures(result);
  if (failureSummary.lines.length > 0) {
    const batchWord =
      failureSummary.failedBatchCount === 1 ? "batch" : "batches";
    reportMessage(
      options.ctx,
      [
        `Formatter failures in ${failureSummary.failedBatchCount} ${batchWord}:`,
        ...failureSummary.lines,
      ].join("\n"),
      "warning",
    );
    return;
  }

  if (options.config.hideSummariesInTui && options.ctx.hasUI) {
    return;
  }

  const allFiles = collectAllFiles(result);
  const successPaths = summarizeSuccessPaths(allFiles);
  const fileWord = allFiles.length === 1 ? "file" : "files";
  const baseMessage = successPaths
    ? `Autoformatted ${allFiles.length} ${fileWord}: ${successPaths}`
    : `Autoformatted ${allFiles.length} ${fileWord}.`;

  const fallbackUsages = summarizeFallbackUsages(result);
  const message =
    fallbackUsages.length > 0
      ? `${baseMessage} [${fallbackUsages.join("; ")}]`
      : baseMessage;

  reportMessage(options.ctx, message, "info");
}

function defaultReportConfigIssues(
  issues: ConfigValidationIssue[],
  options: {
    ctx: ExtensionContextLike;
  },
): void {
  if (issues.length === 0) {
    return;
  }

  const lines = issues.slice(0, 3).map((issue) => {
    if (issue.sourcePath) {
      return `${issue.sourcePath} ${issue.path}: ${issue.message}`;
    }
    return `${issue.path}: ${issue.message}`;
  });

  const remainingCount = issues.length - lines.length;
  if (remainingCount > 0) {
    lines.push(
      `...and ${remainingCount} more issue${remainingCount === 1 ? "" : "s"}.`,
    );
  }

  reportMessage(
    options.ctx,
    ["Configuration issues detected:", ...lines].join("\n"),
    "warning",
  );
}

export function createAutoformatExtension(
  pi: ExtensionApiLike,
  dependencies: AutoformatExtensionDependencies = {},
): void {
  const loadConfig =
    dependencies.loadConfig ?? ((cwd: string) => loadAutoformatConfig({ cwd }));
  const createAutoformatter =
    dependencies.createAutoformatter ?? createDefaultAutoformatter;
  const reportFlushResult =
    dependencies.reportFlushResult ?? defaultReportFlushResult;
  const reportConfigIssues =
    dependencies.reportConfigIssues ?? defaultReportConfigIssues;

  let state: SessionState | undefined;
  let pendingFlush = Promise.resolve();

  function ensureState(cwd: string): SessionState {
    if (state && state.cwd === cwd) {
      return state;
    }

    const loadResult = loadConfig(cwd);
    const detection = loadResult.config.shellMutationDetection;
    const snapshotTracker =
      detection.enabled && detection.snapshotGlobs.length > 0
        ? new SnapshotTracker({
            cwd,
            globs: detection.snapshotGlobs,
          })
        : undefined;
    const autoformatter = createAutoformatter(cwd, loadResult.config);
    const unsubscribeEventBus = subscribeToEventBus(
      pi,
      loadResult.config,
      autoformatter,
    );
    state = {
      cwd,
      loadResult,
      autoformatter,
      snapshotTracker,
      unsubscribeEventBus,
    };
    return state;
  }

  function queueFlush(ctx: ExtensionContextLike): Promise<void> {
    const sessionState = state;
    if (!sessionState) {
      return pendingFlush;
    }

    pendingFlush = pendingFlush
      .then(async () => {
        const result = await sessionState.autoformatter.flushPrompt();
        reportFlushResult(result, {
          config: sessionState.loadResult.config,
          ctx,
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        reportMessage(ctx, `Unexpected runtime error: ${message}`, "warning");
      });

    return pendingFlush;
  }

  pi.on("session_start", async (_event, ctx) => {
    const sessionState = ensureState(ctx.cwd);
    reportConfigIssues(sessionState.loadResult.issues, { ctx });
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") {
      return;
    }
    const sessionState = ensureState(ctx.cwd);
    sessionState.snapshotTracker?.before();
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) {
      return;
    }

    const sessionState = ensureState(ctx.cwd);
    const output = extractToolOutputText(event.content);
    sessionState.autoformatter.recordToolResult(
      event.toolName,
      event.input,
      output,
    );

    if (event.toolName === "bash" && sessionState.snapshotTracker) {
      const snapshotTouched = sessionState.snapshotTracker.after();
      for (const touched of snapshotTouched) {
        sessionState.autoformatter.addTouchedPath(touched);
      }
    }

    if (sessionState.loadResult.config.formatMode === "tool") {
      await queueFlush(ctx);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    const sessionState = ensureState(ctx.cwd);
    if (sessionState.loadResult.config.formatMode !== "prompt") {
      return;
    }

    await queueFlush(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionState = state;
    if (!sessionState) {
      return;
    }

    if (sessionState.loadResult.config.formatMode === "session") {
      await queueFlush(ctx);
    }

    sessionState.unsubscribeEventBus?.();
    state = undefined;
  });
}

export default function autoformatExtension(pi: ExtensionApiLike): void {
  createAutoformatExtension(pi);
}
