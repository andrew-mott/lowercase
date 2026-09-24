import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JSONSchema } from "json-schema-to-typescript";
import {
  generateTypes,
  toTypeAliases,
} from "../scripts/schema-type-compiler.ts";

const generate = (schema: JSONSchema) =>
  generateTypes(schema, {
    source: "fixture.schema.json",
    filepath: path.resolve(import.meta.dirname, "fixture.gen.ts"),
    cwd: import.meta.dirname,
  });

describe("generateTypes", () => {
  it("declares every named object as a type alias", async () => {
    const ts = await generate({
      title: "Step",
      type: "object",
      properties: {
        on: { $ref: "#/$defs/StepOn" },
        headers: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["on"],
      $defs: {
        StepOn: {
          title: "StepOn",
          type: "object",
          properties: { success: { type: "string" } },
        },
      },
    });

    expect(ts).not.toContain("interface");
    expect(ts).toContain("export type Step = {\n");
    expect(ts).toContain("export type StepOn = {\n");
    expect(ts).toContain("  on: StepOn;\n");
  });

  it("leaves an allOf intersection as it is", async () => {
    const ts = await generate({
      title: "Child",
      allOf: [
        { $ref: "#/$defs/Base" },
        { type: "object", properties: { b: { type: "number" } } },
      ],
      $defs: {
        Base: {
          title: "Base",
          type: "object",
          properties: { a: { type: "string" } },
        },
      },
    });

    expect(ts).toContain("export type Child = Base & {\n");
    expect(ts).toContain("export type Base = {\n");
  });

  it("starts with a header naming the schema", async () => {
    const ts = await generate({ title: "Empty", type: "object" });
    expect(ts.split("\n")[0]).toBe("// Generated from fixture.schema.json.");
  });

  it("refuses a schema with no title to name its type", async () => {
    await expect(generate({ type: "object" })).rejects.toThrow(
      "fixture.schema.json needs a title",
    );
  });
});

describe("toTypeAliases", () => {
  it("rewrites an object with no properties", () => {
    expect(toTypeAliases("export interface Empty {}\n")).toBe(
      "export type Empty = {};\n",
    );
  });

  it("refuses an interface it cannot rewrite", () => {
    expect(() =>
      toTypeAliases("export interface Ext extends Base {\n  b?: number;\n}\n"),
    ).toThrow("Cannot turn into a type alias");
  });

  it("closes only the braces of declarations it opened", () => {
    const ts = [
      "export type Union = A | B;",
      "export interface A {",
      "  nested: {",
      "    x: string;",
      "  };",
      "}",
      "",
    ].join("\n");
    expect(toTypeAliases(ts)).toBe(
      [
        "export type Union = A | B;",
        "export type A = {",
        "  nested: {",
        "    x: string;",
        "  };",
        "};",
        "",
      ].join("\n"),
    );
  });
});
