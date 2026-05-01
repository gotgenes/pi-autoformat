import type { ResolvedFormatter } from "./formatter-registry.js";

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

export type BatchRun = {
  formatterName: string;
  command: string[];
  files: string[];
  success: boolean;
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export type ChainGroupInput = {
  chain: ResolvedFormatter[];
  files: string[];
};

export async function executeChainGroup(
  group: ChainGroupInput,
  runner: CommandRunner,
  options?: { cwd?: string },
): Promise<BatchRun[]> {
  if (group.files.length === 0) {
    return [];
  }

  const runs: BatchRun[] = [];
  for (const formatter of group.chain) {
    const [command, ...args] = formatter.command;

    if (!command) {
      runs.push({
        formatterName: formatter.name,
        command: [...formatter.command],
        files: [...group.files],
        success: false,
        exitCode: 1,
        stderr: "Formatter command is empty",
      });
      continue;
    }

    const fullArgs = [...args, ...group.files];
    const runResult = await runner(command, fullArgs, {
      cwd: options?.cwd,
      env: formatter.environment,
    });

    runs.push({
      formatterName: formatter.name,
      command: [command, ...fullArgs],
      files: [...group.files],
      success: runResult.exitCode === 0,
      exitCode: runResult.exitCode,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
    });
  }

  return runs;
}


