import { describe, expect, it } from "vitest";
import { analyzeRefs } from "../src/analyze-references.js";
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
        foo: {},
        bar: {},
      },
      problems: [],
    };

    const fa = analyzeRefs(flowDef, flowAnalysis);
    expect(fa).toEqual(expectedFlowAnalysis);
  });
  it("records a problem for undeclared params refs", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{params.payload.answer}}",
    };
    const flowDef = {
      params: {},
      steps: {
        bar: httpStep,
      },
      start: "bar",
    } as unknown as FlowDefinition;

    const flowAnalysis: FlowAnalysis = {
      nodes: ["bar"],
      inEdges: {},
      outEdges: {},
      joinDeps: {},
      refs: [],
      exportRefsByStep: {},
      problems: [],
    };

    const fa = analyzeRefs(flowDef, flowAnalysis);
    expect(fa.problems).toEqual([
      {
        type: "InvalidRefParamName",
        ref: {
          valuePath: ["params", "payload", "answer"],
          scope: "params",
          bindPath: ["url"],
          stepId: "bar",
          string: "params.payload.answer",
          interpolated: false,
          hash: null,
        },
        paramName: "payload",
      },
    ]);
  });

  it("records a problem for a nested ref into a string-backed export", () => {
    const flowDef = {
      steps: {
        upstream: {
          type: "httpjson",
          url: "url",
          exports: {
            summary: {
              ref: "{{output.message}}",
              type: "text/plain",
            },
          },
          on: { success: "bar" },
        },
        bar: {
          type: "httpjson",
          url: "{{steps.upstream.exports.summary.nested}}",
        },
      },
      start: "upstream",
    } as unknown as FlowDefinition;

    const flowAnalysis: FlowAnalysis = {
      nodes: ["upstream", "bar"],
      inEdges: {},
      outEdges: {
        upstream: [
          {
            endStepId: "bar",
            startStepId: "upstream",
            gate: "onSuccess",
            type: "control",
          },
        ],
      },
      joinDeps: {},
      refs: [],
      exportRefsByStep: {},
      problems: [],
    };

    const fa = analyzeRefs(flowDef, flowAnalysis);
    expect(fa.problems).toEqual([
      {
        type: "InvalidExportRefPath",
        ref: {
          valuePath: ["steps", "upstream", "exports", "summary", "nested"],
          scope: "steps",
          bindPath: ["url"],
          stepId: "bar",
          string: "steps.upstream.exports.summary.nested",
          interpolated: false,
          hash: null,
        },
        exportName: "summary",
        sourceStepId: "upstream",
      },
    ]);
  });
});
