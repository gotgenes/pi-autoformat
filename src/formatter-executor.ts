import type { CommandProbe } from "./command-probe.js";
import { defaultCommandProbe } from "./command-probe.js";
import type {
  ResolvedChainStep,
  ResolvedFormatter,
} from "./formatter-registry.js";

export type CommandRunResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export type CommandRunnerOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunnerOptions,
) => Promise<CommandRunResult>;

export type FallbackContext = {
  skipped: string[];
};

export type BatchRun = {
  formatterName: string;
  command: string[];
  files: string[];
  success: boolean;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  fallbackContext?: FallbackContext;
};

export type ChainGroupInput = {
  chain: ResolvedChainStep[];
  files: string[];
};

export type ExecuteChainGroupOptions = {
  cwd?: string;
  commandProbe?: CommandProbe;
};

async function runFormatter(
  formatter: ResolvedFormatter,
  files: string[],
  runner: CommandRunner,
  cwd: string | undefined,
  fallbackContext?: FallbackContext,
): Promise<BatchRun> {
  const [command, ...args] = formatter.command;

  if (!command) {
    return {
      formatterName: formatter.name,
      command: [...formatter.command],
      files: [...files],
      success: false,
      exitCode: 1,
      stderr: "Formatter command is empty",
      ...(fallbackContext ? { fallbackContext } : {}),
    };
  }

  const fullArgs = [...args, ...files];
  const runResult = await runner(command, fullArgs, {
    cwd,
    env: formatter.environment,
  });

  return {
    formatterName: formatter.name,
    command: [command, ...fullArgs],
    files: [...files],
    success: runResult.exitCode === 0,
    exitCode: runResult.exitCode,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    ...(fallbackContext ? { fallbackContext } : {}),
  };
}

export async function executeChainGroup(
  group: ChainGroupInput,
  runner: CommandRunner,
  options?: ExecuteChainGroupOptions,
): Promise<BatchRun[]> {
  if (group.files.length === 0) {
    return [];
  }

  const probe = options?.commandProbe ?? defaultCommandProbe;
  const runs: BatchRun[] = [];

  for (const step of group.chain) {
    if (step.kind === "single") {
      runs.push(
        await runFormatter(step.formatter, group.files, runner, options?.cwd),
      );
      continue;
    }

    const skipped: string[] = [];
    let chosen: ResolvedFormatter | undefined;
    for (const alternative of step.alternatives) {
      const command = alternative.command[0];
      if (command && probe(command)) {
        chosen = alternative;
        break;
      }
      skipped.push(alternative.name);
    }

    if (!chosen) {
      // All alternatives missing from PATH — group is a no-op as specified.
      continue;
    }

    const fallbackContext: FallbackContext | undefined =
      skipped.length > 0 ? { skipped } : undefined;
    runs.push(
      await runFormatter(
        chosen,
        group.files,
        runner,
        options?.cwd,
        fallbackContext,
      ),
    );
  }

  return runs;
}
