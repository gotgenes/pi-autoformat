/**
 * Acceptance test: verify the extension actually loads under the real
 * `pi` CLI without errors.
 *
 * This is a smoke test, not a full end-to-end suite. It catches regressions
 * that pure unit tests cannot:
 *
 * - the extension entrypoint exports the right shape for Pi's loader
 * - module resolution works in the shipped TypeScript
 * - `session_start` does not throw against a real ExtensionContext
 *
 * It deliberately uses Pi's `--mode rpc` with `get_state`, which avoids any
 * LLM call (so no API keys, no cost, no flakiness).
 *
 * The test is skipped when the `pi` CLI is not on PATH, so contributors
 * without Pi installed (and CI environments that do not provision it)
 * are not blocked. The follow-up acceptance suite tracked in the
 * "expand acceptance test coverage" issue should harden this further.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const piAvailable = spawnSync("pi", ["--help"], { stdio: "ignore" }).status === 0;
const describeIfPi = piAvailable ? describe : describe.skip;

const EXTENSION_PATH = resolve(__dirname, "..", "src", "extension.ts");

type RpcResponse = {
  id?: string;
  type: string;
  command?: string;
  success?: boolean;
  data?: unknown;
};

async function runRpcSession(
  cwd: string,
  commands: object[],
  timeoutMs = 10_000,
): Promise<{ responses: RpcResponse[]; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "pi",
      [
        "--mode",
        "rpc",
        "--no-tools",
        "--no-extensions",
        "--no-session",
        "-e",
        EXTENSION_PATH,
      ],
      { cwd, stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(
        new Error(
          `pi rpc session timed out after ${timeoutMs}ms\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const responses = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as RpcResponse);
      resolvePromise({ responses, stderr, exitCode: code });
    });

    for (const command of commands) {
      child.stdin.write(`${JSON.stringify(command)}\n`);
    }
    child.stdin.end();
  });
}

describeIfPi("acceptance: extension loads under real pi CLI", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "pi-autoformat-acceptance-"));
  });

  afterAll(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("loads the extension and answers an rpc get_state command", async () => {
    const { responses, stderr, exitCode } = await runRpcSession(workDir, [
      { id: "1", type: "get_state" },
    ]);

    // Pi must exit cleanly after stdin closes.
    expect(exitCode).toBe(0);

    // No "Extension load error" or stack trace from our entrypoint should
    // appear on stderr. We allow Pi's own informational lines to pass.
    expect(stderr).not.toMatch(/pi-autoformat/i);
    expect(stderr).not.toMatch(/Extension .* error/i);

    const stateResponse = responses.find((r) => r.id === "1");
    expect(stateResponse).toBeDefined();
    expect(stateResponse?.success).toBe(true);
    expect(stateResponse?.command).toBe("get_state");
  });
});

if (!piAvailable) {
  describe.skip("acceptance suite", () => {
    it("skipped because the `pi` CLI is not on PATH", () => {
      // Intentionally empty.
    });
  });
}
