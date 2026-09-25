import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import branchStepSchema from "../src/schemas/branch.step.schema.json" with { type: "json" };
import flowDefinitionSchema from "../src/schemas/flow-definition.schema.json" with { type: "json" };
import flowKindSchema from "../src/schemas/flow-kind.schema.json" with { type: "json" };
import flowOutputDefinitionSchema from "../src/schemas/flow-output-definition.schema.json" with { type: "json" };
import flowParamDefinitionSchema from "../src/schemas/flow-param-definition.schema.json" with { type: "json" };
import httpJsonStepSchema from "../src/schemas/http-json.step.schema.json" with { type: "json" };
import httpStepSchema from "../src/schemas/http.step.schema.json" with { type: "json" };
import joinStepSchema from "../src/schemas/join.step.schema.json" with { type: "json" };
import mcpStepSchema from "../src/schemas/mcp.step.schema.json" with { type: "json" };
import parallelStepSchema from "../src/schemas/parallel.step.schema.json" with { type: "json" };
import stepCapCommonFieldsSchema from "../src/schemas/step-cap-common-fields.schema.json" with { type: "json" };
import stepOnFieldSchema from "../src/schemas/step-on-field.schema.json" with { type: "json" };

const validate = (value: unknown) => {
  const ajv = new Ajv2020({ allErrors: true });
  for (const schema of [
    flowKindSchema,
    flowParamDefinitionSchema,
    flowOutputDefinitionSchema,
    branchStepSchema,
    joinStepSchema,
    parallelStepSchema,
    stepCapCommonFieldsSchema,
    stepOnFieldSchema,
    httpJsonStepSchema,
    mcpStepSchema,
    httpStepSchema,
  ]) {
    ajv.addSchema(schema);
  }
  return ajv.compile(flowDefinitionSchema)(value);
};

const completeFlow = {
  name: "complete",
  version: "1",
  description: "Exercises every currently supported step.",
  kind: "business",
  params: { prompt: { type: "text/plain", optional: true } },
  outputs: { result: { payload: "{{steps.http.output}}" } },
  start: "branch",
  steps: {
    branch: {
      type: "branch",
      value: "{{params.prompt}}",
      cases: { yes: "parallel" },
      default: "join",
    },
    parallel: { type: "parallel", steps: ["mcp", "httpjson"] },
    join: { type: "join", steps: ["parallel"], next: "http" },
    mcp: {
      type: "mcp",
      url: "https://example.test/mcp",
      transport: "streamable-http",
      feature: { primitive: "tool", name: "search" },
    },
    httpjson: { type: "httpjson", url: "https://example.test/search" },
    http: { type: "http", url: "https://example.test/result" },
  },
};

describe("flow definition schema", () => {
  it("composes every supported step variant", () => {
    expect(validate(completeFlow)).toBe(true);
  });

  it("rejects unknown root fields", () => {
    expect(validate({ ...completeFlow, inputs: {} })).toBe(false);
  });

  it("rejects malformed step data through the composed union", () => {
    expect(
      validate({
        ...completeFlow,
        steps: { invalid: { type: "mcp", transport: "http", feature: {} } },
      }),
    ).toBe(false);
  });
});
