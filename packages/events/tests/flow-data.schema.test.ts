import { describe, expect, it } from "vitest";
import { FlowSubmittedDataSchema } from "../src/schemas/flow-data.schema.js";

const submittedFlow = {
  flow: { id: "flow", name: "test", version: "1" },
  run: { id: "run" },
  inputs: {},
  definition: {
    name: "test",
    version: "1",
    start: "step",
    steps: {
      step: {
        type: "mcp",
        url: "https://example.test/mcp",
        transport: "http",
        feature: { primitive: "tool", name: "search" },
      },
    },
  },
};

describe("flow event data", () => {
  it("delegates flow-definition validation to AJV", () => {
    expect(FlowSubmittedDataSchema.safeParse(submittedFlow).success).toBe(true);
  });

  it("reports AJV flow errors within the event definition field", () => {
    const parsed = FlowSubmittedDataSchema.safeParse({
      ...submittedFlow,
      definition: {
        ...submittedFlow.definition,
        steps: {
          step: {
            ...submittedFlow.definition.steps.step,
            feature: {
              ...submittedFlow.definition.steps.step.feature,
              legacy: true,
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues).toEqual([
      expect.objectContaining({
        path: ["definition", "steps", "step", "feature"],
        message: 'unknown field "legacy"',
      }),
    ]);
  });
});
