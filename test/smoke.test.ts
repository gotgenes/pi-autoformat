import { describe, expect, it } from "vitest";

import { extensionName } from "../src/index.js";

describe("smoke", () => {
  it("exports extension name", () => {
    expect(extensionName).toBe("pi-autoformat");
  });
});
