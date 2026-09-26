import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { flowDefinitionSchemaId, flowSchemaDocuments } from "../src/index.js";

describe("flow schema documents", () => {
  it("exposes each authored document once under its existing id", () => {
    const ids = flowSchemaDocuments.map((schema) => schema.$id);

    expect(new Set(ids)).toHaveLength(ids.length);
    expect(ids).toContain(flowDefinitionSchemaId);
  });

  it("resolves the composed root through the public document collection", () => {
    const ajv = new Ajv2020({ allErrors: true });
    for (const schema of flowSchemaDocuments) ajv.addSchema(schema);

    const validate = ajv.getSchema(flowDefinitionSchemaId);
    expect(validate).toBeDefined();
    expect(
      validate?.({
        name: "flow",
        version: "1",
        start: "request",
        steps: {
          request: { type: "httpjson", url: "https://example.test" },
        },
      }),
    ).toBe(true);
  });
});
