import { describe, expect, it, vi } from "vitest";

import type { LoadConfigResult } from "../src/config-loader.js";
import { createAutoformatExtension } from "../src/extension.js";
import { createFormatterConfig } from "../src/formatter-config.js";
import type { PromptAutoformatterResult } from "../src/prompt-autoformatter.js";

type Handler = (event: unknown, ctx: TestContext) => void | Promise<void>;

type EventName =
  | "session_start"
  | "tool_call"
  | "tool_result"
  | "agent_end"
  | "session_shutdown";

type TestContext = {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
};

class TestPi {
  private readonly handlers = new Map<EventName, Handler[]>();

  on(eventName: EventName, handler: Handler): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
  }

  async emit(
    eventName: EventName,
    event: unknown,
    ctx: TestContext,
  ): Promise<void> {
    for (const handler of this.handlers.get(eventName) ?? []) {
      await handler(event, ctx);
    }
  }
}

function createLoadResult(
  formatMode: "tool" | "prompt" | "session",
): LoadConfigResult {
  return {
    config: createFormatterConfig({ formatMode }),
    globalConfigPath: "/global/config.json",
    projectConfigPath: "/project/config.json",
    issues: [],
  };
}

function createContext(overrides?: Partial<TestContext>): TestContext {
  return {
    cwd: "/repo",
    hasUI: true,
    ui: {
      notify: vi.fn(),
    },
    ...overrides,
  };
}

function createFlushResult(): PromptAutoformatterResult {
  return {
    files: [
      {
        path: "/repo/src/example.ts",
        runs: [],
      },
    ],
  };
}

describe("createAutoformatExtension", () => {
  it("reports interactive success summaries with touched file paths", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          files: [
            {
              path: "/repo/src/example.ts",
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  success: true,
                  exitCode: 0,
                },
              ],
            },
            {
              path: "/repo/README.md",
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  success: true,
                  exitCode: 0,
                },
              ],
            },
          ],
        }),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    await pi.emit("agent_end", {}, ctx);

    expect(notify).toHaveBeenCalledWith(
      "Autoformatted 2 files: /repo/src/example.ts, /repo/README.md",
      "info",
    );
  });

  it("hides interactive success summaries when configured", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue({
        ...createLoadResult("prompt"),
        config: createFormatterConfig({
          formatMode: "prompt",
          hideSummariesInTui: true,
        }),
      }),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue(createFlushResult()),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    await pi.emit("agent_end", {}, ctx);

    expect(notify).not.toHaveBeenCalled();
  });

  it("reports non-interactive formatter failures via console warnings", async () => {
    const pi = new TestPi();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = createContext({ hasUI: false });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          files: [
            {
              path: "/repo/README.md",
              runs: [
                {
                  formatterName: "prettier",
                  command: ["prettier", "--write", "/repo/README.md"],
                  success: false,
                  exitCode: 2,
                },
                {
                  formatterName: "markdownlint-cli2",
                  command: ["markdownlint-cli2", "--fix", "/repo/README.md"],
                  success: false,
                  exitCode: 1,
                },
              ],
            },
          ],
        }),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    await pi.emit("agent_end", {}, ctx);

    expect(warn).toHaveBeenCalledWith(
      "[pi-autoformat] Formatter failures in 1 file (2 failed runs):\n/repo/README.md: prettier (exit 2), markdownlint-cli2 (exit 1)",
    );
    expect(log).not.toHaveBeenCalled();

    warn.mockRestore();
    log.mockRestore();
  });

  it("reports non-interactive config issues via console warnings", async () => {
    const pi = new TestPi();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = createContext({ hasUI: false });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue({
        ...createLoadResult("prompt"),
        issues: [
          {
            path: "formatMode",
            message: "Expected a valid mode.",
            sourcePath: "/repo/.pi/extensions/pi-autoformat/config.json",
          },
        ],
      }),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({ files: [] }),
      }),
    });

    await pi.emit("session_start", {}, ctx);

    expect(warn).toHaveBeenCalledWith(
      "[pi-autoformat] Configuration issues detected:\n/repo/.pi/extensions/pi-autoformat/config.json formatMode: Expected a valid mode.",
    );

    warn.mockRestore();
  });

  it("records successful tool results and flushes at prompt end in prompt mode", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const autoformatter = {
      recordToolResult: vi.fn(),
      flushPrompt: vi.fn().mockResolvedValue(createFlushResult()),
    };
    const reportFlushResult = vi.fn();

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue(autoformatter),
      reportFlushResult,
    });

    await pi.emit("session_start", {}, ctx);
    await pi.emit(
      "tool_result",
      {
        toolName: "write",
        input: { path: "src/example.ts", content: "export {};" },
        isError: false,
      },
      ctx,
    );
    await pi.emit("agent_end", {}, ctx);

    expect(autoformatter.recordToolResult).toHaveBeenCalledWith(
      "write",
      {
        path: "src/example.ts",
        content: "export {};",
      },
      "",
    );
    expect(autoformatter.flushPrompt).toHaveBeenCalledTimes(1);
    expect(reportFlushResult).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately in tool mode", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const autoformatter = {
      recordToolResult: vi.fn(),
      flushPrompt: vi.fn().mockResolvedValue({ files: [] }),
    };

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("tool")),
      createAutoformatter: vi.fn().mockReturnValue(autoformatter),
      reportFlushResult: vi.fn(),
    });

    await pi.emit(
      "tool_result",
      {
        toolName: "edit",
        input: { path: "src/example.ts", edits: [] },
        isError: false,
      },
      ctx,
    );

    expect(autoformatter.recordToolResult).toHaveBeenCalledTimes(1);
    expect(autoformatter.flushPrompt).toHaveBeenCalledTimes(1);
  });

  it("flushes on session shutdown in session mode and ignores failed tool results", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const autoformatter = {
      recordToolResult: vi.fn(),
      flushPrompt: vi.fn().mockResolvedValue({ files: [] }),
    };

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("session")),
      createAutoformatter: vi.fn().mockReturnValue(autoformatter),
      reportFlushResult: vi.fn(),
    });

    await pi.emit("session_start", {}, ctx);
    await pi.emit(
      "tool_result",
      {
        toolName: "write",
        input: { path: "src/example.ts", content: "" },
        isError: true,
      },
      ctx,
    );
    await pi.emit("session_shutdown", {}, ctx);

    expect(autoformatter.recordToolResult).not.toHaveBeenCalled();
    expect(autoformatter.flushPrompt).toHaveBeenCalledTimes(1);
  });

  it("forwards bash tool output to the autoformatter", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const autoformatter = {
      recordToolResult: vi.fn(),
      flushPrompt: vi.fn().mockResolvedValue({ files: [] }),
      addTouchedPath: vi.fn(),
    };

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue(autoformatter),
      reportFlushResult: vi.fn(),
    });

    await pi.emit(
      "tool_result",
      {
        toolName: "bash",
        input: { command: "sed -i 's/a/b/' foo.txt" },
        isError: false,
        content: [{ type: "text", text: "some output" }],
      },
      ctx,
    );

    expect(autoformatter.recordToolResult).toHaveBeenCalledWith(
      "bash",
      { command: "sed -i 's/a/b/' foo.txt" },
      "some output",
    );
  });

  it("reports config issues on session start", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const reportConfigIssues = vi.fn();

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue({
        ...createLoadResult("prompt"),
        issues: [
          {
            path: "formatMode",
            message: "Expected a valid mode.",
            sourcePath: "/repo/.pi/extensions/pi-autoformat/config.json",
          },
        ],
      }),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({ files: [] }),
      }),
      reportConfigIssues,
    });

    await pi.emit("session_start", {}, ctx);

    expect(reportConfigIssues).toHaveBeenCalledWith(
      [
        {
          path: "formatMode",
          message: "Expected a valid mode.",
          sourcePath: "/repo/.pi/extensions/pi-autoformat/config.json",
        },
      ],
      { ctx },
    );
  });
});
