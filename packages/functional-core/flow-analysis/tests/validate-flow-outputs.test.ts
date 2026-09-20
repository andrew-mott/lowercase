import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { validateFlowOutputs } from "../src/analyze-outputs.js";
import { analyzeFlow } from "../src/analyze-flow.js";
import { analyzeRefs } from "../src/analyze-references.js";

const flowWith = (outputs: Record<string, string>): FlowDefinition => ({
  name: "speak",
  version: "1",
  start: "tts",
  steps: {
    tts: {
      type: "http",
      url: "http://localhost/v1/audio/speech",
      exports: { text: { ref: "{{output.text}}", type: "text/plain" } },
      on: { success: "done" },
    },
    done: { type: "parallel", steps: [] },
  },
  outputs: Object.fromEntries(
    Object.entries(outputs).map(([name, payload]) => [name, { payload }]),
  ),
});

describe("validateFlowOutputs()", () => {
  it("accepts a whole output and a declared export", () => {
    const fd = flowWith({
      speech: "{{steps.tts.output}}",
      text: "{{steps.tts.exports.text}}",
    });
    expect(validateFlowOutputs(fd)).toEqual([]);
  });

  it("accepts a flow with no outputs", () => {
    const fd = flowWith({});
    delete fd.outputs;
    expect(validateFlowOutputs(fd)).toEqual([]);
  });

  it("flags a payload that isn't a whole-value step reference", () => {
    expect(validateFlowOutputs(flowWith({ speech: "nope" }))).toEqual([
      {
        type: "InvalidFlowOutputPayload",
        outputName: "speech",
        payloadDefinition: "nope",
      },
    ]);
  });

  it("flags a reference to a step that doesn't exist", () => {
    expect(
      validateFlowOutputs(flowWith({ speech: "{{steps.ghost.output}}" })),
    ).toEqual([
      {
        type: "InvalidFlowOutputTarget",
        outputName: "speech",
        targetStepId: "ghost",
        reason: "unknown-step",
      },
    ]);
  });

  it("flags an export the step doesn't declare", () => {
    expect(
      validateFlowOutputs(flowWith({ speech: "{{steps.tts.exports.nope}}" })),
    ).toEqual([
      {
        type: "InvalidFlowOutputTarget",
        outputName: "speech",
        targetStepId: "tts",
        reason: "undeclared-export",
      },
    ]);
  });

  it("flags the whole output of a step that produces none", () => {
    expect(
      validateFlowOutputs(flowWith({ speech: "{{steps.done.output}}" })),
    ).toEqual([
      {
        type: "InvalidFlowOutputTarget",
        outputName: "speech",
        targetStepId: "done",
        reason: "no-output",
      },
    ]);
  });

  it("flags an export on a step type that can't declare any", () => {
    const problems = validateFlowOutputs(
      flowWith({ speech: "{{steps.done.exports.text}}" }),
    );
    expect(problems).toMatchObject([{ reason: "undeclared-export" }]);
  });

  it("reports each bad output separately", () => {
    const problems = validateFlowOutputs(
      flowWith({ a: "nope", b: "{{steps.ghost.output}}" }),
    );
    expect(problems.map((p) => p.type)).toEqual([
      "InvalidFlowOutputPayload",
      "InvalidFlowOutputTarget",
    ]);
  });
});

describe("analyzeRefs() with outputs", () => {
  it("adds output problems to the analysis", () => {
    const fd = flowWith({ speech: "{{steps.ghost.output}}" });
    const fa = analyzeRefs(fd, analyzeFlow(fd));
    expect(fa.problems).toMatchObject([{ type: "InvalidFlowOutputTarget" }]);
  });
});
