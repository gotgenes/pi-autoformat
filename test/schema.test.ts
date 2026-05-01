import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schemaPath = join(process.cwd(), "schemas", "pi-autoformat.schema.json");

type SchemaShape = {
  $defs?: {
    formatterDefinition?: {
      properties?: Record<string, unknown>;
    };
    chainStep?: unknown;
  };
  properties?: {
    chains?: {
      additionalProperties?: {
        type?: string;
        items?: unknown;
      };
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

  describe("chains step shape", () => {
    it("declares chains items as a oneOf of string and fallback object", () => {
      const items = schema.properties?.chains?.additionalProperties?.items as
        | { oneOf?: unknown[] }
        | undefined;
      expect(items).toBeDefined();
      expect(Array.isArray(items?.oneOf)).toBe(true);
      expect(items?.oneOf?.length).toBe(2);
    });

    it("includes a string variant for chain steps", () => {
      const items = schema.properties?.chains?.additionalProperties?.items as
        | { oneOf?: Array<{ type?: string; minLength?: number }> }
        | undefined;
      const stringVariant = items?.oneOf?.find((v) => v?.type === "string");
      expect(stringVariant).toBeDefined();
      expect(stringVariant?.minLength).toBe(1);
    });

    it("includes a fallback object variant with a non-empty string array", () => {
      const items = schema.properties?.chains?.additionalProperties?.items as
        | { oneOf?: Array<Record<string, unknown>> }
        | undefined;
      const fallbackVariant = items?.oneOf?.find((v) => v?.type === "object") as
        | {
            type?: string;
            additionalProperties?: boolean;
            required?: string[];
            properties?: {
              fallback?: {
                type?: string;
                minItems?: number;
                items?: { type?: string; minLength?: number };
              };
            };
          }
        | undefined;
      expect(fallbackVariant).toBeDefined();
      expect(fallbackVariant?.additionalProperties).toBe(false);
      expect(fallbackVariant?.required).toEqual(["fallback"]);
      const fallback = fallbackVariant?.properties?.fallback;
      expect(fallback?.type).toBe("array");
      expect(fallback?.minItems).toBe(1);
      expect(fallback?.items?.type).toBe("string");
      expect(fallback?.items?.minLength).toBe(1);
    });
  });
});
