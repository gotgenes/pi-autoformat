import { existsSync } from "node:fs";
import path from "node:path";

import type { BatchRun } from "./formatter-executor.js";

export type DiscoveryCache = Map<string, string | null>;

export type BuiltinPartition = {
  handled: string[];
  unhandled: string[];
  /** When true, the run is treated as a no-op skip (not a failed run). */
  treatAsSkip: boolean;
};

export type BuiltinDiscoveryContext = {
  cache?: DiscoveryCache;
};

export type BuiltinFormatter = {
  name: string;
  /**
   * Discover the dispatcher's config root by walking up from each touched
   * file's directory. Returns undefined when no config applies, in which
   * case the built-in is skipped for that flush. Cached per session via the
   * provided cache.
   */
  discoverRoot(
    files: string[],
    context?: BuiltinDiscoveryContext,
  ): Promise<string | undefined>;
  /** Build the argv to invoke given the discovered root and the file batch. */
  buildCommand(
    root: string,
    files: string[],
  ): { command: string[]; cwd: string };
  /**
   * Inspect a completed BatchRun and return the subset of input files the
   * dispatcher reported as "no formatter matched". Those files fall through
   * to subsequent chain steps / per-extension chains.
   */
  partitionUnhandled(run: BatchRun, files: string[]): BuiltinPartition;
};

/**
 * Walk up from each file's directory looking for the first directory whose
 * `match(dir)` returns true. Memoizes results in the optional cache, keyed
 * by visited directory, so repeated calls within a session avoid redundant
 * stat work.
 */
function walkUp(
  files: string[],
  match: (dir: string) => boolean,
  cache?: DiscoveryCache,
): string | undefined {
  for (const file of files) {
    let dir = path.dirname(path.resolve(file));
    const visited: string[] = [];
    while (true) {
      if (cache?.has(dir)) {
        const cached = cache.get(dir);
        const resolved = cached ?? undefined;
        for (const v of visited) {
          cache.set(v, cached ?? null);
        }
        if (resolved) return resolved;
        break;
      }
      visited.push(dir);
      if (match(dir)) {
        if (cache) {
          for (const v of visited) cache.set(v, dir);
        }
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        if (cache) {
          for (const v of visited) cache.set(v, null);
        }
        break;
      }
      dir = parent;
    }
  }
  return undefined;
}

function hasTreefmtConfig(dir: string): boolean {
  return (
    existsSync(path.join(dir, "treefmt.toml")) ||
    existsSync(path.join(dir, ".treefmt.toml"))
  );
}

function hasTreefmtNixConfig(dir: string): boolean {
  if (!existsSync(path.join(dir, "flake.nix"))) {
    return false;
  }
  return (
    existsSync(path.join(dir, "treefmt.nix")) ||
    existsSync(path.join(dir, "nix", "treefmt.nix"))
  );
}

const treefmt: BuiltinFormatter = {
  name: "treefmt",
  async discoverRoot(files, context) {
    return walkUp(files, hasTreefmtConfig, context?.cache);
  },
  buildCommand(_root, _files) {
    // Command builder is implemented in a later TDD step.
    return { command: ["treefmt"], cwd: _root };
  },
  partitionUnhandled(_run, files) {
    // Skip-pattern parsing is implemented in a later TDD step.
    return { handled: [...files], unhandled: [], treatAsSkip: false };
  },
};

const treefmtNix: BuiltinFormatter = {
  name: "treefmt-nix",
  async discoverRoot(files, context) {
    return walkUp(files, hasTreefmtNixConfig, context?.cache);
  },
  buildCommand(_root, _files) {
    return { command: ["nix", "fmt"], cwd: _root };
  },
  partitionUnhandled(_run, files) {
    return { handled: [...files], unhandled: [], treatAsSkip: false };
  },
};

export const BUILTIN_FORMATTERS: Record<string, BuiltinFormatter> = {
  treefmt,
  "treefmt-nix": treefmtNix,
};

export function isBuiltinFormatterName(name: string): boolean {
  return Object.hasOwn(BUILTIN_FORMATTERS, name);
}

export function getBuiltinFormatter(
  name: string,
): BuiltinFormatter | undefined {
  return BUILTIN_FORMATTERS[name];
}
