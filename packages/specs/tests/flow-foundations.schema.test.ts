import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import flowKindSchema from "../src/schemas/flow-kind.schema.json" with { type: "json" };
import flowOutputDefinitionSchema from "../src/schemas/flow-output-definition.schema.json" with { type: "json" };
import flowParamDefinitionSchema from "../src/schemas/flow-param-definition.schema.json" with { type: "json" };

const validate = (schema: object, value: unknown) =>
  new Ajv2020().compile(schema)(value);

describe("flow foundation schemas", () => {
  it("limits flow kinds to the supported values", () => {
    expect(validate(flowKindSchema, "business")).toBe(true);
    expect(validate(flowKindSchema, "eval")).toBe(true);
    expect(validate(flowKindSchema, "service")).toBe(false);
  });

  it("matches flow parameter definitions", () => {
    expect(validate(flowParamDefinitionSchema, { type: "text/plain" })).toBe(
      true,
    );
    expect(
      validate(flowParamDefinitionSchema, {
        type: "application/json",
        optional: true,
      }),
    ).toBe(true);
    expect(validate(flowParamDefinitionSchema, { type: "" })).toBe(false);
    expect(
      validate(flowParamDefinitionSchema, {
        type: "text/plain",
        optional: false,
      }),
    ).toBe(false);
    expect(
      validate(flowParamDefinitionSchema, { type: "text/plain", extra: true }),
    ).toBe(false);
  });

  it("matches flow output definitions", () => {
    expect(
      validate(flowOutputDefinitionSchema, { payload: "{{steps.tts.output}}" }),
    ).toBe(true);
    expect(validate(flowOutputDefinitionSchema, { payload: 3 })).toBe(false);
    expect(
      validate(flowOutputDefinitionSchema, {
        payload: "{{steps.tts.output}}",
        extra: true,
      }),
    ).toBe(false);
  });
});
