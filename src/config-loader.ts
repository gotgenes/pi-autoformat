import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  type AutoformatConfig,
  createFormatterConfig,
  type FormatMode,
  type UserFormatterConfig,
} from "./formatter-config.js";
import type { FormatterDefinition } from "./formatter-registry.js";

export const AUTOFORMAT_EXTENSION_ID = "pi-autoformat";
export const AUTOFORMAT_CONFIG_FILE_NAME = "config.json";

export type ConfigValidationIssue = {
  path: string;
  message: string;
  sourcePath?: string;
};

export type ValidateConfigResult = {
  config: UserFormatterConfig;
  issues: ConfigValidationIssue[];
};

export type LoadConfigResult = {
  config: AutoformatConfig;
  globalConfigPath: string;
  projectConfigPath: string;
  issues: ConfigValidationIssue[];
};

function defaultAgentDir(): string {
  return join(homedir(), ".pi", "agent");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(
  issues: ConfigValidationIssue[],
  path: string,
  message: string,
  sourcePath?: string,
): void {
  issues.push({ path, message, sourcePath });
}

function validateFormatMode(
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): FormatMode | undefined {
  if (value === "tool" || value === "prompt" || value === "session") {
    return value;
  }

  pushIssue(
    issues,
    "formatMode",
    'Expected one of "tool", "prompt", or "session".',
    sourcePath,
  );
  return undefined;
}

function validateCommandTimeoutMs(
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  pushIssue(
    issues,
    "commandTimeoutMs",
    "Expected a positive integer.",
    sourcePath,
  );
  return undefined;
}

function validateBooleanField(
  fieldPath: string,
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  pushIssue(issues, fieldPath, "Expected a boolean.", sourcePath);
  return undefined;
}

function validateStringArray(
  fieldPath: string,
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    pushIssue(
      issues,
      fieldPath,
      "Expected a non-empty array of strings.",
      sourcePath,
    );
    return undefined;
  }

  const normalized: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "string" || entry.length === 0) {
      pushIssue(
        issues,
        `${fieldPath}[${index}]`,
        "Expected a non-empty string.",
        sourcePath,
      );
      return undefined;
    }
    normalized.push(entry);
  }

  return normalized;
}

function validateExtensionArray(
  fieldPath: string,
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): string[] | undefined {
  const extensions = validateStringArray(fieldPath, value, issues, sourcePath);
  if (!extensions) {
    return undefined;
  }

  const normalized: string[] = [];
  for (let index = 0; index < extensions.length; index += 1) {
    const extension = extensions[index];
    if (!extension.startsWith(".")) {
      pushIssue(
        issues,
        `${fieldPath}[${index}]`,
        'Expected a file extension beginning with ".".',
        sourcePath,
      );
      return undefined;
    }

    const lowercased = extension.toLowerCase();
    if (!normalized.includes(lowercased)) {
      normalized.push(lowercased);
    }
  }

  return normalized;
}

function validateEnvironment(
  fieldPath: string,
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      fieldPath,
      "Expected an object with string values.",
      sourcePath,
    );
    return undefined;
  }

  const environment: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      pushIssue(
        issues,
        `${fieldPath}.${key}`,
        "Expected a string value.",
        sourcePath,
      );
      return undefined;
    }
    environment[key] = entry;
  }

  return environment;
}

function validateFormatterDefinition(
  formatterName: string,
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): FormatterDefinition | undefined {
  const fieldPath = `formatters.${formatterName}`;
  if (!isRecord(value)) {
    pushIssue(issues, fieldPath, "Expected an object.", sourcePath);
    return undefined;
  }

  const definition: Partial<FormatterDefinition> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (key === "command") {
      definition.command = validateStringArray(
        `${fieldPath}.command`,
        entry,
        issues,
        sourcePath,
      );
      continue;
    }

    if (key === "extensions") {
      definition.extensions = validateExtensionArray(
        `${fieldPath}.extensions`,
        entry,
        issues,
        sourcePath,
      );
      continue;
    }

    if (key === "environment") {
      definition.environment = validateEnvironment(
        `${fieldPath}.environment`,
        entry,
        issues,
        sourcePath,
      );
      continue;
    }

    if (key === "disabled") {
      definition.disabled = validateBooleanField(
        `${fieldPath}.disabled`,
        entry,
        issues,
        sourcePath,
      );
      continue;
    }

    pushIssue(
      issues,
      `${fieldPath}.${key}`,
      "Unknown formatter property.",
      sourcePath,
    );
  }

  if (!definition.command || !definition.extensions) {
    if (!definition.command) {
      pushIssue(
        issues,
        `${fieldPath}.command`,
        "Missing required property.",
        sourcePath,
      );
    }
    if (!definition.extensions) {
      pushIssue(
        issues,
        `${fieldPath}.extensions`,
        "Missing required property.",
        sourcePath,
      );
    }
    return undefined;
  }

  return {
    command: definition.command,
    extensions: definition.extensions,
    environment: definition.environment,
    disabled: definition.disabled,
  };
}

function validateFormatters(
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): Record<string, FormatterDefinition> | undefined {
  if (!isRecord(value)) {
    pushIssue(issues, "formatters", "Expected an object.", sourcePath);
    return undefined;
  }

  const formatters: Record<string, FormatterDefinition> = {};
  for (const [formatterName, formatterValue] of Object.entries(value)) {
    const definition = validateFormatterDefinition(
      formatterName,
      formatterValue,
      issues,
      sourcePath,
    );
    if (definition) {
      formatters[formatterName] = definition;
    }
  }

  return formatters;
}

function validateChains(
  value: unknown,
  issues: ConfigValidationIssue[],
  sourcePath?: string,
): Record<string, string[]> | undefined {
  if (!isRecord(value)) {
    pushIssue(issues, "chains", "Expected an object.", sourcePath);
    return undefined;
  }

  const chains: Record<string, string[]> = {};
  for (const [extension, chainValue] of Object.entries(value)) {
    if (!extension.startsWith(".")) {
      pushIssue(
        issues,
        `chains.${extension}`,
        'Expected a file extension key beginning with ".".',
        sourcePath,
      );
      continue;
    }

    const chain = validateStringArray(
      `chains.${extension}`,
      chainValue,
      issues,
      sourcePath,
    );
    if (chain) {
      chains[extension.toLowerCase()] = chain;
    }
  }

  return chains;
}

function validateConfigObject(
  value: unknown,
  sourcePath?: string,
): ValidateConfigResult {
  const issues: ConfigValidationIssue[] = [];
  const config: UserFormatterConfig = {};

  if (!isRecord(value)) {
    pushIssue(issues, "$", "Expected a JSON object.", sourcePath);
    return { config, issues };
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === "$schema") {
      if (typeof entry !== "string") {
        pushIssue(issues, "$schema", "Expected a string.", sourcePath);
      }
      continue;
    }

    if (key === "formatMode") {
      const formatMode = validateFormatMode(entry, issues, sourcePath);
      if (formatMode) {
        config.formatMode = formatMode;
      }
      continue;
    }

    if (key === "commandTimeoutMs") {
      const commandTimeoutMs = validateCommandTimeoutMs(
        entry,
        issues,
        sourcePath,
      );
      if (commandTimeoutMs !== undefined) {
        config.commandTimeoutMs = commandTimeoutMs;
      }
      continue;
    }

    if (key === "hideSummariesInTui") {
      const hideSummariesInTui = validateBooleanField(
        "hideSummariesInTui",
        entry,
        issues,
        sourcePath,
      );
      if (hideSummariesInTui !== undefined) {
        config.hideSummariesInTui = hideSummariesInTui;
      }
      continue;
    }

    if (key === "formatters") {
      const formatters = validateFormatters(entry, issues, sourcePath);
      if (formatters) {
        config.formatters = formatters;
      }
      continue;
    }

    if (key === "chains") {
      const chains = validateChains(entry, issues, sourcePath);
      if (chains) {
        config.chains = chains;
      }
      continue;
    }

    pushIssue(issues, key, "Unknown top-level property.", sourcePath);
  }

  return { config, issues };
}

export function validateUserFormatterConfig(
  value: unknown,
  sourcePath?: string,
): ValidateConfigResult {
  return validateConfigObject(value, sourcePath);
}

function readJsonFile(filePath: string): unknown | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
}

function mergeUserConfigs(
  base: UserFormatterConfig,
  overrides: UserFormatterConfig,
): UserFormatterConfig {
  return {
    formatMode: overrides.formatMode ?? base.formatMode,
    commandTimeoutMs: overrides.commandTimeoutMs ?? base.commandTimeoutMs,
    hideSummariesInTui: overrides.hideSummariesInTui ?? base.hideSummariesInTui,
    formatters: {
      ...base.formatters,
      ...overrides.formatters,
    },
    chains: {
      ...base.chains,
      ...overrides.chains,
    },
  };
}

export function getGlobalConfigPath(agentDir = defaultAgentDir()): string {
  return join(
    agentDir,
    "extensions",
    AUTOFORMAT_EXTENSION_ID,
    AUTOFORMAT_CONFIG_FILE_NAME,
  );
}

export function getProjectConfigPath(cwd: string): string {
  return join(
    cwd,
    ".pi",
    "extensions",
    AUTOFORMAT_EXTENSION_ID,
    AUTOFORMAT_CONFIG_FILE_NAME,
  );
}

export function loadAutoformatConfig(options?: {
  cwd?: string;
  agentDir?: string;
}): LoadConfigResult {
  const cwd = options?.cwd ?? process.cwd();
  const agentDir = options?.agentDir ?? defaultAgentDir();
  const globalConfigPath = getGlobalConfigPath(agentDir);
  const projectConfigPath = getProjectConfigPath(cwd);
  const issues: ConfigValidationIssue[] = [];

  let mergedUserConfig: UserFormatterConfig = {};

  for (const configPath of [globalConfigPath, projectConfigPath]) {
    const rawConfig = (() => {
      try {
        return readJsonFile(configPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushIssue(issues, "$", `Failed to read config: ${message}`, configPath);
        return undefined;
      }
    })();

    if (rawConfig === undefined) {
      continue;
    }

    const validated = validateUserFormatterConfig(rawConfig, configPath);
    issues.push(...validated.issues);
    mergedUserConfig = mergeUserConfigs(mergedUserConfig, validated.config);
  }

  return {
    config: createFormatterConfig(mergedUserConfig),
    globalConfigPath,
    projectConfigPath,
    issues,
  };
}
