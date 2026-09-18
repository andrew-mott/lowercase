import { describe, expect, it } from "vitest";
import { findAndParseRefs } from "../src/analyze-references.js";
import type { FlowAnalysis, FlowDefinition, StepHttpJson } from "@lcase/types";

describe("findAndParseRefs()", () => {
  it("find and parses references in a step", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{steps.foo}}",
    };
    const flowDef = {
      steps: {
        foo: {
          type: "httpjson",
          url: "url",
        },
        bar: httpStep,
      },
    } as unknown as FlowDefinition;

    const flowAnalysis: FlowAnalysis = {
      nodes: ["foo", "bar"],
      inEdges: {},
      outEdges: {
        foo: [
          {
            endStepId: "bar",
            startStepId: "foo",
            gate: "always",
            type: "control",
          },
        ],
      },
      joinDeps: {},
      refs: [],
      exportRefsByStep: {},
      problems: [],
    };

    const expectedFlowAnalysis: FlowAnalysis = {
      nodes: ["foo", "bar"],
      inEdges: {},
      outEdges: {
        foo: [
          {
            endStepId: "bar",
            startStepId: "foo",
            gate: "always",
            type: "control",
          },
        ],
      },
      joinDeps: {},
      refs: [
        {
          valuePath: ["steps", "foo"],
          scope: "steps",
          bindPath: ["url"],
          stepId: "bar",
          string: "steps.foo",
          interpolated: false,
          hash: null,
        },
      ],
      exportRefsByStep: {
        bar: {},
      },
      problems: [],
    };

    findAndParseRefs("bar", flowDef, flowAnalysis);
    expect(flowAnalysis).toEqual(expectedFlowAnalysis);
  });
});
