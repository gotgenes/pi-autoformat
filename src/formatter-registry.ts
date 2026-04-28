import path from "node:path";

export type FormatterDefinition = {
  command: string[];
  extensions: string[];
  environment?: Record<string, string>;
  disabled?: boolean;
};

export type FormatterConfig = {
  formatters: Record<string, FormatterDefinition>;
  chains?: Record<string, string[]>;
};

export type ResolvedFormatter = {
  name: string;
  command: string[];
  environment?: Record<string, string>;
};

export function resolveFormatterChainForFile(
  filePath: string,
  config: FormatterConfig,
): ResolvedFormatter[] {
  const extension = path.extname(filePath).toLowerCase();
  if (!extension) {
    return [];
  }

  const chainNames = config.chains?.[extension];
  if (!chainNames) {
    return [];
  }

  return chainNames
    .map((formatterName) =>
      resolveFormatterByName(formatterName, filePath, config),
    )
    .filter((formatter): formatter is ResolvedFormatter => formatter !== null);
}

function resolveFormatterByName(
  formatterName: string,
  filePath: string,
  config: FormatterConfig,
): ResolvedFormatter | null {
  const formatter = config.formatters[formatterName];
  if (!formatter || formatter.disabled) {
    return null;
  }

  return {
    name: formatterName,
    command: substituteFileToken(formatter.command, filePath),
    environment: formatter.environment,
  };
}

function substituteFileToken(command: string[], filePath: string): string[] {
  return command.map((arg) => arg.replaceAll("$FILE", filePath));
}
