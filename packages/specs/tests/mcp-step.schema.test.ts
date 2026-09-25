import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import mcpStepSchema from "../src/schemas/mcp.step.schema.json" with { type: "json" };
import stepCapCommonFieldsSchema from "../src/schemas/step-cap-common-fields.schema.json" with { type: "json" };
import stepOnFieldSchema from "../src/schemas/step-on-field.schema.json" with { type: "json" };

const validate = (value: unknown) => {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(stepCapCommonFieldsSchema);
  ajv.addSchema(stepOnFieldSchema);
  return ajv.compile(mcpStepSchema)(value);
};

describe("MCP step schema", () => {
  it("accepts the complete current capability contract", () => {
    expect(
      validate({
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "streamable-http",
        feature: { primitive: "tool", name: "search" },
        args: { query: "{{params.query}}" },
        tool: "search",
        on: { success: "next", failure: "recover" },
      }),
    ).toBe(true);
  });

  it("keeps feature input open for the current Zod normalization boundary", () => {
    expect(
      validate({
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "http",
        feature: { primitive: "tool", name: "search", legacy: true },
      }),
    ).toBe(true);
  });

  it("rejects malformed and unknown outer fields", () => {
    expect(
      validate({
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "fetch",
        feature: { primitive: "tool", name: "search" },
      }),
    ).toBe(false);
    expect(
      validate({
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "http",
        feature: { primitive: "other", name: "search" },
      }),
    ).toBe(false);
    expect(
      validate({
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "http",
        feature: { primitive: "tool", name: "search" },
        pipe: {},
      }),
    ).toBe(false);
  });
});
