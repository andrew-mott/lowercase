import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import stepCapCommonFieldsSchema from "../src/schemas/step-cap-common-fields.schema.json" with { type: "json" };
import stepOnFieldSchema from "../src/schemas/step-on-field.schema.json" with { type: "json" };

const validate = (schema: object, value: unknown) =>
  new Ajv2020().compile(schema)(value);

describe("shared capability-field schemas", () => {
  it("matches capability common fields", () => {
    expect(
      validate(stepCapCommonFieldsSchema, {
        args: { query: "{{params.query}}", limit: 10 },
        tool: "search",
      }),
    ).toBe(true);
    expect(validate(stepCapCommonFieldsSchema, { args: [] })).toBe(false);
    expect(validate(stepCapCommonFieldsSchema, { tool: 3 })).toBe(false);
  });

  it("matches success and failure routing", () => {
    expect(
      validate(stepOnFieldSchema, {
        on: { success: "next", failure: "recover" },
      }),
    ).toBe(true);
    expect(validate(stepOnFieldSchema, { on: { success: 3 } })).toBe(false);
    expect(validate(stepOnFieldSchema, { on: { skipped: "next" } })).toBe(
      false,
    );
  });

  it("leaves sibling properties for a composed step root", () => {
    expect(
      validate(stepCapCommonFieldsSchema, {
        type: "httpjson",
        url: "https://x",
      }),
    ).toBe(true);
    expect(
      validate(stepOnFieldSchema, { type: "httpjson", url: "https://x" }),
    ).toBe(true);
  });
});
