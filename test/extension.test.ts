import { describe, expect, it, vi } from "vitest";

import type { LoadConfigResult } from "../src/config-loader.js";
import { createAutoformatExtension } from "../src/extension.js";
import { createFormatterConfig } from "../src/formatter-config.js";
import type { PromptAutoformatterResult } from "../src/prompt-autoformatter.js";

type Handler = (event: unknown, ctx: TestContext) => void | Promise<void>;

type EventName =
  | "session_start"
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

function createContext(): TestContext {
  return {
    cwd: "/repo",
    hasUI: true,
    ui: {
      notify: vi.fn(),
    },
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

    expect(autoformatter.recordToolResult).toHaveBeenCalledWith("write", {
      path: "src/example.ts",
      content: "export {};",
    });
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
