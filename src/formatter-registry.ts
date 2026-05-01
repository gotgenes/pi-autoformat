import path from "node:path";

export type FormatterDefinition = {
  command: string[];
  environment?: Record<string, string>;
  disabled?: boolean;
};

export type FallbackChainStep = {
  fallback: string[];
};

export type ChainStep = string | FallbackChainStep;

export function isFallbackChainStep(
  step: ChainStep,
): step is FallbackChainStep {
  return typeof step === "object" && step !== null && "fallback" in step;
}

export type FormatterConfig = {
  formatters: Record<string, FormatterDefinition>;
  chains?: Record<string, ChainStep[]>;
};

export type ResolvedFormatter = {
  name: string;
  command: string[];
  environment?: Record<string, string>;
};

export type ResolvedSingleStep = {
  kind: "single";
  formatter: ResolvedFormatter;
};

export type ResolvedFallbackStep = {
  kind: "fallback";
  alternatives: ResolvedFormatter[];
};

export type ResolvedChainStep = ResolvedSingleStep | ResolvedFallbackStep;

export type ChainGroup = {
  chain: ChainStep[];
  files: string[];
};

function encodeChainStep(step: ChainStep): string {
  if (typeof step === "string") {
    return `S:${step}`;
  }
  return `F:${step.fallback.join("|")}`;
}

function encodeChain(chain: ChainStep[]): string {
  return chain.map(encodeChainStep).join("\u0000");
}

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
    const chainSteps = config.chains?.[extension];
    if (!chainSteps || chainSteps.length === 0) {
      continue;
    }
    const key = encodeChain(chainSteps);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ chain: [...chainSteps], files: [filePath] });
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
    const formatter = resolveFormatterByName(name, config);
    if (formatter) {
      resolved.push(formatter);
    }
  }
  return resolved;
}

function resolveFormatterByName(
  name: string,
  config: FormatterConfig,
): ResolvedFormatter | undefined {
  const formatter = config.formatters[name];
  if (!formatter || formatter.disabled) {
    return undefined;
  }
  return {
    name,
    command: [...formatter.command],
    environment: formatter.environment,
  };
}

export function resolveChainSteps(
  steps: ChainStep[],
  config: FormatterConfig,
): ResolvedChainStep[] {
  const resolved: ResolvedChainStep[] = [];
  for (const step of steps) {
    if (typeof step === "string") {
      const formatter = resolveFormatterByName(step, config);
      if (formatter) {
        resolved.push({ kind: "single", formatter });
      }
      continue;
    }
    const alternatives: ResolvedFormatter[] = [];
    for (const name of step.fallback) {
      const formatter = resolveFormatterByName(name, config);
      if (formatter) {
        alternatives.push(formatter);
      }
    }
    if (alternatives.length > 0) {
      resolved.push({ kind: "fallback", alternatives });
    }
  }
  return resolved;
}
