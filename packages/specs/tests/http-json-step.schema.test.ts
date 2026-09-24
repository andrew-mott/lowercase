import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import httpJsonStepSchema from "../src/schemas/http-json.step.schema.json" with { type: "json" };
import stepCapCommonFieldsSchema from "../src/schemas/step-cap-common-fields.schema.json" with { type: "json" };
import stepOnFieldSchema from "../src/schemas/step-on-field.schema.json" with { type: "json" };

const validate = (value: unknown) => {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(stepCapCommonFieldsSchema);
  ajv.addSchema(stepOnFieldSchema);
  return ajv.compile(httpJsonStepSchema)(value);
};

describe("httpjson step schema", () => {
  it("accepts the complete legacy capability contract", () => {
    expect(
      validate({
        type: "httpjson",
        url: "https://example.test/search",
        args: { query: "{{params.query}}" },
        tool: "search",
        on: { success: "next", failure: "recover" },
        method: "POST",
        headers: { authorization: "Bearer {{params.token}}" },
        body: { query: "{{params.query}}" },
        exports: {
          result: {
            ref: "result",
            type: "application/json",
            schema: { type: "object" },
            evalContext: {
              prompt: { source: "param", name: "prompt" },
              prior: { source: "export", stepId: "prepare", name: "text" },
              response: { source: "output", stepId: "prepare" },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts every shallow JSON body form", () => {
    for (const body of [null, false, 2, "text", ["nested"], { nested: {} }]) {
      expect(validate({ type: "httpjson", url: "https://x", body })).toBe(true);
    }
  });

  it("rejects unknown fields and malformed export declarations", () => {
    expect(validate({ type: "httpjson", url: "https://x", pipe: {} })).toBe(
      false,
    );
    expect(
      validate({
        type: "httpjson",
        url: "https://x",
        headers: { authorization: 3 },
      }),
    ).toBe(false);
    expect(
      validate({
        type: "httpjson",
        url: "https://x",
        exports: {
          result: {
            ref: "result",
            type: "application/json",
            evalContext: {
              prompt: { source: "param", name: "prompt", extra: true },
            },
          },
        },
      }),
    ).toBe(false);
  });
});
