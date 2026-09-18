import { describe, expect, it } from "vitest";
import {
  validateExportRefPath,
  validateRefTargetStep,
} from "../src/analyze-references.js";
import type {
  FlowAnalysis,
  FlowDefinition,
  InvalidRefStepIdProblem,
  Ref,
  StepHttpJson,
} from "@lcase/types";

describe("validateRefTargetStep()", () => {
  it("validates a correct step reference", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo"],
      scope: "steps",
      bindPath: ["url"],
      stepId: "bar",
      string: "steps.foo",
      hash: null,
      interpolated: false,
    };
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
      problems: [],
    };
    const problem = validateRefTargetStep(ref, flowDef, flowAnalysis);
    expect(problem).toBe(undefined);
  });
  it("invalidates an incorrect step reference", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo"],
      scope: "steps",
      bindPath: ["url"],
      stepId: "bar",
      string: "steps.foo",
      hash: null,
      interpolated: false,
    };
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{steps.foo}}",
    };
    const flowDef = {
      steps: {
        other: {
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
      problems: [],
    };
    const expectedProblem: InvalidRefStepIdProblem = {
      type: "InvalidRefStepId",
      ref: {
        valuePath: ["steps", "foo"],
        scope: "steps",
        stepId: "bar",
        bindPath: ["url"],
        string: "steps.foo",
        hash: null,
        interpolated: false,
      },
      targetStepId: "foo",
    };
    const problem = validateRefTargetStep(ref, flowDef, flowAnalysis);
    expect(problem).toEqual(expectedProblem);
  });
});

describe("validateExportRefPath()", () => {
  function makeFlowDef(
    exportType: "text/plain" | "application/json",
  ): FlowDefinition {
    return {
      steps: {
        upstream: {
          type: "httpjson",
          url: "url",
          exports: {
            summary: {
              ref: "{{output.message}}",
              type: exportType,
            },
          },
        },
      },
    } as unknown as FlowDefinition;
  }

  it("rejects a nested path into a text/plain export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary", "nested"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary.nested",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("text/plain"));

    expect(problem).toEqual({
      type: "InvalidExportRefPath",
      ref,
      exportName: "summary",
      sourceStepId: "upstream",
    });
  });

  it("allows the whole-value path into a text/plain export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("text/plain"));

    expect(problem).toBeUndefined();
  });

  it("allows arbitrary depth into an application/json export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary", "nested"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary.nested",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("application/json"));

    expect(problem).toBeUndefined();
  });
});
