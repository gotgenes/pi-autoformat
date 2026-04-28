import { describe, expect, it } from "vitest";

import { TouchedFilesQueue } from "../src/touched-files-queue.js";

describe("TouchedFilesQueue", () => {
  it("collects paths from write and edit tool results", () => {
    const queue = new TouchedFilesQueue("/repo");

    queue.recordToolResult("write", { path: "src/index.ts" });
    queue.recordToolResult("edit", { path: "docs/readme.md" });

    expect(queue.flush()).toEqual([
      "/repo/src/index.ts",
      "/repo/docs/readme.md",
    ]);
  });

  it("dedupes repeated file touches in a prompt", () => {
    const queue = new TouchedFilesQueue("/repo");

    queue.recordToolResult("write", { path: "src/index.ts" });
    queue.recordToolResult("edit", { path: "./src/index.ts" });
    queue.recordToolResult("edit", { path: "/repo/src/index.ts" });

    expect(queue.flush()).toEqual(["/repo/src/index.ts"]);
  });

  it("ignores non-mutation tools and invalid payloads", () => {
    const queue = new TouchedFilesQueue("/repo");

    queue.recordToolResult("bash", { path: "src/index.ts" });
    queue.recordToolResult("write", { foo: "bar" });
    queue.recordToolResult("edit", null);

    expect(queue.flush()).toEqual([]);
  });

  it("clears collected state after flush", () => {
    const queue = new TouchedFilesQueue("/repo");

    queue.recordToolResult("write", { path: "src/index.ts" });

    expect(queue.flush()).toEqual(["/repo/src/index.ts"]);
    expect(queue.flush()).toEqual([]);
  });
});
