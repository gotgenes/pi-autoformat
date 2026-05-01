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

export type ChainGroup = {
  chain: string[];
  files: string[];
};

export function groupFilesByChain(
  files: string[],
  config: FormatterConfig,
): ChainGroup[] {
  const groups: ChainGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!extension) {
      continue;
    }
    const chainNames = config.chains?.[extension];
    if (!chainNames || chainNames.length === 0) {
      continue;
    }
    const key = chainNames.join("\u0000");
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ chain: [...chainNames], files: [filePath] });
    } else {
      groups[existingIndex].files.push(filePath);
    }
  }

  return groups;
}

export function resolveChain(
  chainNames: string[],
  config: FormatterConfig,
): ResolvedFormatter[] {
  const resolved: ResolvedFormatter[] = [];
  for (const name of chainNames) {
    const formatter = config.formatters[name];
    if (!formatter || formatter.disabled) {
      continue;
    }
    resolved.push({
      name,
      command: [...formatter.command],
      environment: formatter.environment,
    });
  }
  return resolved;
}


