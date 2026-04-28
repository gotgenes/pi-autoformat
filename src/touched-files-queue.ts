import path from "node:path";

type ToolResultPayload = {
  path?: unknown;
};

const MUTATION_TOOLS = new Set(["write", "edit"]);

export class TouchedFilesQueue {
  private readonly cwd: string;
  private readonly touchedFiles = new Set<string>();

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  recordToolResult(toolName: string, payload: unknown): void {
    if (!MUTATION_TOOLS.has(toolName)) {
      return;
    }

    if (!isToolResultPayload(payload) || typeof payload.path !== "string") {
      return;
    }

    this.touchedFiles.add(normalizePath(this.cwd, payload.path));
  }

  flush(): string[] {
    const files = [...this.touchedFiles];
    this.touchedFiles.clear();
    return files;
  }
}

function isToolResultPayload(value: unknown): value is ToolResultPayload {
  return typeof value === "object" && value !== null;
}

function normalizePath(cwd: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }

  return path.normalize(path.resolve(cwd, filePath));
}
