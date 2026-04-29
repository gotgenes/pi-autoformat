import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

export type FormatScopeSetting = "repoRoot" | "cwd" | string[];

export type FormatScope = {
  /** Absolute, normalized roots. A path is in scope if it falls under any root. */
  roots: string[];
  /** Whether comparisons should be case-insensitive (darwin/win32). */
  caseInsensitive: boolean;
};

export type ResolveFormatScopeOptions = {
  cwd: string;
  setting?: FormatScopeSetting;
  /** Override for tests. Default: detect via `git rev-parse --show-toplevel`. */
  detectGitRoot?: (cwd: string) => string | undefined;
  platform?: NodeJS.Platform;
};

function defaultDetectGitRoot(cwd: string): string | undefined {
  try {
    const stdout = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function safeRealpath(absPath: string): string {
  try {
    return realpathSync(absPath);
  } catch {
    return absPath;
  }
}

export function resolveFormatScope(
  options: ResolveFormatScopeOptions,
): FormatScope {
  const setting: FormatScopeSetting = options.setting ?? "repoRoot";
  const platform = options.platform ?? process.platform;
  const caseInsensitive = platform === "darwin" || platform === "win32";

  const detectGitRoot = options.detectGitRoot ?? defaultDetectGitRoot;

  const rawRoots: string[] = (() => {
    if (setting === "cwd") {
      return [options.cwd];
    }
    if (setting === "repoRoot") {
      const gitRoot = detectGitRoot(options.cwd);
      return [gitRoot ?? options.cwd];
    }
    if (Array.isArray(setting)) {
      if (setting.length === 0) {
        return [options.cwd];
      }
      return setting.map((entry) =>
        path.isAbsolute(entry) ? entry : path.resolve(options.cwd, entry),
      );
    }
    return [options.cwd];
  })();

  const roots = rawRoots
    .map((root) => safeRealpath(path.normalize(root)))
    .filter((root, index, arr) => arr.indexOf(root) === index);

  return { roots, caseInsensitive };
}

function caseFold(value: string, caseInsensitive: boolean): string {
  return caseInsensitive ? value.toLowerCase() : value;
}

function isUnder(
  candidate: string,
  root: string,
  caseInsensitive: boolean,
): boolean {
  const rel = path.relative(
    caseFold(root, caseInsensitive),
    caseFold(candidate, caseInsensitive),
  );
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return false;
  }
  return true;
}

/**
 * Returns true if `absCandidate` is inside any scope root.
 *
 * If the candidate path exists, both sides are realpath'd so that symlinked
 * workspace deps resolve correctly. If the candidate does not exist (e.g.,
 * a `mv` source after a move), the normalized absolute form is used.
 */
export function isInFormatScope(
  absCandidate: string,
  scope: FormatScope,
): boolean {
  const normalized = path.normalize(absCandidate);
  const resolvedCandidate = safeRealpath(normalized);
  for (const root of scope.roots) {
    if (
      isUnder(resolvedCandidate, root, scope.caseInsensitive) ||
      isUnder(normalized, root, scope.caseInsensitive)
    ) {
      return true;
    }
  }
  return false;
}
