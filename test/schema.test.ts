import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schemaPath = join(process.cwd(), "schemas", "pi-autoformat.schema.json");

type SchemaShape = {
  $defs?: {
    formatterDefinition?: {
      properties?: Record<string, unknown>;
    };
  };
};

describe("pi-autoformat.schema.json", () => {
  const schema: SchemaShape = JSON.parse(readFileSync(schemaPath, "utf8"));

  it("does not declare an extensions property on formatterDefinition", () => {
    const properties = schema.$defs?.formatterDefinition?.properties ?? {};
    expect(properties).not.toHaveProperty("extensions");
  });

  it("still declares command on formatterDefinition", () => {
    const properties = schema.$defs?.formatterDefinition?.properties ?? {};
    expect(properties).toHaveProperty("command");
  });
});
