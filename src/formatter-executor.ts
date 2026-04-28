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

export type FormatterExecutionResult = {
  formatterName: string;
  command: string[];
  success: boolean;
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export async function executeFormatterChain(
  chain: ResolvedFormatter[],
  runner: CommandRunner,
  options?: {
    cwd?: string;
  },
): Promise<FormatterExecutionResult[]> {
  const results: FormatterExecutionResult[] = [];

  for (const formatter of chain) {
    const [command, ...args] = formatter.command;

    if (!command) {
      results.push({
        formatterName: formatter.name,
        command: formatter.command,
        success: false,
        exitCode: 1,
        stderr: "Formatter command is empty",
      });
      continue;
    }

    const runResult = await runner(command, args, {
      cwd: options?.cwd,
      env: formatter.environment,
    });

    results.push({
      formatterName: formatter.name,
      command: formatter.command,
      success: runResult.exitCode === 0,
      exitCode: runResult.exitCode,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
    });
  }

  return results;
}
