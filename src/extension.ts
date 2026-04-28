import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  AUTOFORMAT_EXTENSION_ID,
  type ConfigValidationIssue,
  type LoadConfigResult,
  loadAutoformatConfig,
} from "./config-loader.js";
import type { AutoformatConfig } from "./formatter-config.js";
import type { CommandRunner, CommandRunResult } from "./formatter-executor.js";
import {
  PromptAutoformatter,
  type PromptAutoformatterResult,
} from "./prompt-autoformatter.js";

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

type ToolResultEventLike = {
  toolName: string;
  input: unknown;
  isError: boolean;
};

type ExtensionHandler<TEvent> = (
  event: TEvent,
  ctx: ExtensionContextLike,
) => void | Promise<void>;

type ExtensionApiLike = {
  on(eventName: "session_start", handler: ExtensionHandler<unknown>): void;
  on(
    eventName: "tool_result",
    handler: ExtensionHandler<ToolResultEventLike>,
  ): void;
  on(eventName: "agent_end", handler: ExtensionHandler<unknown>): void;
  on(eventName: "session_shutdown", handler: ExtensionHandler<unknown>): void;
};

type PromptAutoformatterLike = Pick<
  PromptAutoformatter,
  "recordToolResult" | "flushPrompt"
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

function createDefaultAutoformatter(
  cwd: string,
  config: AutoformatConfig,
): PromptAutoformatterLike {
  return new PromptAutoformatter(
    cwd,
    config,
    createCommandRunner(config.commandTimeoutMs),
  );
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

function summarizeFailures(result: PromptAutoformatterResult): string[] {
  const lines: string[] = [];

  for (const file of result.files) {
    const failures = file.runs.filter((run) => !run.success);
    if (failures.length === 0) {
      continue;
    }

    const details = failures
      .map((run) => `${run.formatterName} (exit ${run.exitCode})`)
      .join(", ");
    lines.push(`${file.path}: ${details}`);
  }

  return lines;
}

function defaultReportFlushResult(
  result: PromptAutoformatterResult,
  options: {
    config: AutoformatConfig;
    ctx: ExtensionContextLike;
  },
): void {
  if (result.files.length === 0) {
    return;
  }

  const failureLines = summarizeFailures(result);
  if (failureLines.length > 0) {
    reportMessage(
      options.ctx,
      [
        `Formatter failures in ${failureLines.length} file${failureLines.length === 1 ? "" : "s"}:`,
        ...failureLines,
      ].join("\n"),
      "warning",
    );
    return;
  }

  if (options.config.hideSummariesInTui && options.ctx.hasUI) {
    return;
  }

  reportMessage(
    options.ctx,
    `Autoformatted ${result.files.length} file${result.files.length === 1 ? "" : "s"}.`,
    "info",
  );
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
    state = {
      cwd,
      loadResult,
      autoformatter: createAutoformatter(cwd, loadResult.config),
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

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) {
      return;
    }

    const sessionState = ensureState(ctx.cwd);
    sessionState.autoformatter.recordToolResult(event.toolName, event.input);

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

    state = undefined;
  });
}

export default function autoformatExtension(pi: ExtensionApiLike): void {
  createAutoformatExtension(pi);
}
