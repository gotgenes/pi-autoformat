import { describe, expect, it, vi } from "vitest";

import type { LoadConfigResult } from "../src/config-loader.js";
import {
  createAutoformatExtension,
  createDefaultAutoformatter,
  type ExtensionApiLike,
} from "../src/extension.js";
import { createFormatterConfig } from "../src/formatter-config.js";
import type { PromptAutoformatterResult } from "../src/prompt-autoformatter.js";

type Handler = (event: never, ctx: TestContext) => void | Promise<void>;

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
    setStatus?: (key: string, text: string | undefined) => void;
    theme?: { fg: (name: string, text: string) => string };
  };
};

class TestPi {
  private readonly handlers = new Map<EventName, Handler[]>();
  private readonly busHandlers = new Map<
    string,
    Array<(data: unknown) => void>
  >();

  readonly on: ExtensionApiLike["on"] = (
    eventName: EventName,
    handler: Handler,
  ): void => {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
  };

  readonly events: NonNullable<ExtensionApiLike["events"]> = {
    on: (channel, handler) => {
      const existing = this.busHandlers.get(channel) ?? [];
      existing.push(handler);
      this.busHandlers.set(channel, existing);
      return () => {
        const current = this.busHandlers.get(channel) ?? [];
        this.busHandlers.set(
          channel,
          current.filter((h) => h !== handler),
        );
      };
    },
  };

  emitBus(channel: string, data: unknown): void {
    for (const handler of this.busHandlers.get(channel) ?? []) {
      handler(data);
    }
  }

  busHandlerCount(channel: string): number {
    return (this.busHandlers.get(channel) ?? []).length;
  }

  async emit(
    eventName: EventName,
    event: unknown,
    ctx: TestContext,
  ): Promise<void> {
    for (const handler of this.handlers.get(eventName) ?? []) {
      await handler(event as never, ctx);
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
      setStatus: vi.fn(),
      theme: { fg: (_name: string, text: string) => text },
    },
    ...overrides,
  };
}

function createFlushResult(): PromptAutoformatterResult {
  return {
    groups: [
      {
        chain: ["prettier"],
        files: ["/repo/src/example.ts"],
        runs: [
          {
            formatterName: "prettier",
            command: ["prettier", "--write", "/repo/src/example.ts"],
            files: ["/repo/src/example.ts"],
            success: true,
            exitCode: 0,
          },
        ],
      },
    ],
  };
}

describe("createAutoformatExtension", () => {
  it("clears the autoformat status on an empty flush in the TUI", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    expect(setStatus).toHaveBeenCalledWith("autoformat", undefined);
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports interactive success summaries via the footer status", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: ["prettier"],
              files: ["/repo/src/example.ts", "/repo/README.md"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/src/example.ts", "/repo/README.md"],
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
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    expect(setStatus).toHaveBeenCalledTimes(1);
    const [statusKey, statusText] = setStatus.mock.calls[0];
    expect(statusKey).toBe("autoformat");
    expect(statusText).toContain("autoformat:");
    expect(statusText).toContain("2 files");
    expect(statusText).toContain("prettier");
    expect(notify).not.toHaveBeenCalled();
  });

  it("counts files across multiple groups in the success summary", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: ["prettier"],
              files: ["/repo/a.ts", "/repo/b.ts"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/a.ts", "/repo/b.ts"],
                  success: true,
                  exitCode: 0,
                },
              ],
            },
            {
              chain: ["prettier", "markdownlint"],
              files: ["/repo/c.md"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/c.md"],
                  success: true,
                  exitCode: 0,
                },
                {
                  formatterName: "markdownlint",
                  command: [],
                  files: ["/repo/c.md"],
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
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    const [, statusText] = setStatus.mock.calls[0];
    expect(statusText).toContain("3 files");
    expect(statusText).toContain("prettier");
    expect(statusText).toContain("markdownlint");
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports per-batch failure lines listing each batch's files", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const fg = vi.fn((_name: string, text: string) => text);
    const ctx = createContext({
      ui: { notify, setStatus, theme: { fg } },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: ["prettier"],
              files: ["/repo/a.ts", "/repo/b.ts"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/a.ts", "/repo/b.ts"],
                  success: false,
                  exitCode: 2,
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
      "Formatter failures in 1 batch:\nprettier (exit 2): /repo/a.ts, /repo/b.ts",
      "warning",
    );
    const failureStatusCalls = setStatus.mock.calls.filter(
      (c) => c[1] !== undefined,
    );
    expect(failureStatusCalls).toHaveLength(1);
    const [statusKey, statusText] = failureStatusCalls[0];
    expect(statusKey).toBe("autoformat");
    expect(statusText).toContain("1 batch failed");
    expect(statusText).toContain("prettier");
    expect(fg).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("shows mixed-result failures with surviving success batches in the status", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: ["prettier", "markdownlint"],
              files: ["/repo/x.md"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/x.md"],
                  success: true,
                  exitCode: 0,
                },
                {
                  formatterName: "markdownlint",
                  command: [],
                  files: ["/repo/x.md"],
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
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("markdownlint (exit 1): /repo/x.md"),
      "warning",
    );
    const failureStatus = setStatus.mock.calls.find(
      (c) => c[1] !== undefined,
    );
    expect(failureStatus).toBeDefined();
    const text = failureStatus?.[1] as string;
    expect(text).toContain("1 batch failed");
    expect(text).toContain("1 ok");
  });

  it("renders fallback context in success summaries when present", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: [{ fallback: ["biome", "prettier"] }],
              files: ["/repo/a.ts"],
              runs: [
                {
                  formatterName: "prettier",
                  command: ["prettier", "--write", "/repo/a.ts"],
                  files: ["/repo/a.ts"],
                  success: true,
                  exitCode: 0,
                  fallbackContext: { skipped: ["biome"] },
                },
              ],
            },
          ],
        }),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    const statusTexts = setStatus.mock.calls.map((c) => c[1] as string);
    expect(
      statusTexts.some((m) =>
        /prettier \(fallback after biome unavailable\)/.test(m),
      ),
    ).toBe(true);
  });

  it("renders fallback context in failure summaries when present", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const ctx = createContext({ ui: { notify } });

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: [{ fallback: ["biome", "prettier"] }],
              files: ["/repo/a.ts"],
              runs: [
                {
                  formatterName: "prettier",
                  command: ["prettier", "--write", "/repo/a.ts"],
                  files: ["/repo/a.ts"],
                  success: false,
                  exitCode: 2,
                  fallbackContext: { skipped: ["biome"] },
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
      "Formatter failures in 1 batch:\nprettier (fallback after biome unavailable) (exit 2): /repo/a.ts",
      "warning",
    );
  });

  it("hides interactive success summaries when configured", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
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
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    expect(notify).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith("autoformat", undefined);
  });

  it("still surfaces failures when hideSummariesInTui is true", async () => {
    const pi = new TestPi();
    const notify = vi.fn();
    const setStatus = vi.fn();
    const ctx = createContext({
      ui: {
        notify,
        setStatus,
        theme: { fg: (_name: string, text: string) => text },
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
        flushPrompt: vi.fn().mockResolvedValue({
          groups: [
            {
              chain: ["prettier"],
              files: ["/repo/a.ts"],
              runs: [
                {
                  formatterName: "prettier",
                  command: [],
                  files: ["/repo/a.ts"],
                  success: false,
                  exitCode: 2,
                },
              ],
            },
          ],
        }),
      }),
    });

    await pi.emit("session_start", {}, ctx);
    setStatus.mockClear();
    await pi.emit("agent_end", {}, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("prettier (exit 2): /repo/a.ts"),
      "warning",
    );
    const failureStatus = setStatus.mock.calls.find(
      (c) => c[1] !== undefined,
    );
    expect(failureStatus?.[1]).toContain("1 batch failed");
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
          groups: [
            {
              chain: ["prettier", "markdownlint-cli2"],
              files: ["/repo/README.md"],
              runs: [
                {
                  formatterName: "prettier",
                  command: ["prettier", "--write", "/repo/README.md"],
                  files: ["/repo/README.md"],
                  success: false,
                  exitCode: 2,
                },
                {
                  formatterName: "markdownlint-cli2",
                  command: ["markdownlint-cli2", "--fix", "/repo/README.md"],
                  files: ["/repo/README.md"],
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
      "[pi-autoformat] Formatter failures in 2 batches:\nprettier (exit 2): /repo/README.md\nmarkdownlint-cli2 (exit 1): /repo/README.md",
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
        flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
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
      flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
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
      flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
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
      flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
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
        flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
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

  it("subscribes to the configured EventBus channel and forwards touched paths", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const addTouchedPath = vi.fn();
    const autoformatter = {
      recordToolResult: vi.fn(),
      flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
      addTouchedPath,
    };

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue(createLoadResult("prompt")),
      createAutoformatter: vi.fn().mockReturnValue(autoformatter),
      reportFlushResult: vi.fn(),
    });

    await pi.emit("session_start", {}, ctx);
    expect(pi.busHandlerCount("autoformat:touched")).toBe(1);

    pi.emitBus("autoformat:touched", { path: "src/a.ts" });
    pi.emitBus("autoformat:touched", {
      paths: ["src/b.ts", "src/c.ts"],
    });
    pi.emitBus("autoformat:touched", "not-an-object");

    expect(addTouchedPath.mock.calls.map((c) => c[0])).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);

    await pi.emit("session_shutdown", {}, ctx);
    expect(pi.busHandlerCount("autoformat:touched")).toBe(0);
  });

  it("does not subscribe when eventBusMutationChannel.enabled is false", async () => {
    const pi = new TestPi();
    const ctx = createContext();

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue({
        ...createLoadResult("prompt"),
        config: createFormatterConfig({
          formatMode: "prompt",
          eventBusMutationChannel: { enabled: false },
        }),
      }),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
        addTouchedPath: vi.fn(),
      }),
      reportFlushResult: vi.fn(),
    });

    await pi.emit("session_start", {}, ctx);
    expect(pi.busHandlerCount("autoformat:touched")).toBe(0);
  });

  it("respects a custom EventBus channel name", async () => {
    const pi = new TestPi();
    const ctx = createContext();
    const addTouchedPath = vi.fn();

    createAutoformatExtension(pi, {
      loadConfig: vi.fn().mockReturnValue({
        ...createLoadResult("prompt"),
        config: createFormatterConfig({
          formatMode: "prompt",
          eventBusMutationChannel: { channel: "my:channel" },
        }),
      }),
      createAutoformatter: vi.fn().mockReturnValue({
        recordToolResult: vi.fn(),
        flushPrompt: vi.fn().mockResolvedValue({ groups: [] }),
        addTouchedPath,
      }),
      reportFlushResult: vi.fn(),
    });

    await pi.emit("session_start", {}, ctx);
    pi.emitBus("my:channel", { path: "src/x.ts" });
    expect(addTouchedPath).toHaveBeenCalledWith("src/x.ts");
  });

  it("wires customMutationTools into the default autoformatter queue", async () => {
    const config = createFormatterConfig({
      customMutationTools: [{ toolName: "my-codegen", pathField: "output" }],
      formatters: {
        "echo-fmt": {
          command: ["true"],
        },
      },
    });
    const autoformatter = createDefaultAutoformatter("/repo", config);

    autoformatter.recordToolResult(
      "my-codegen",
      { output: "src/generated.ts" },
      "",
    );
    const result = await autoformatter.flushPrompt();

    expect(result.groups.flatMap((g) => g.files)).toEqual([
      "/repo/src/generated.ts",
    ]);
  });
});
