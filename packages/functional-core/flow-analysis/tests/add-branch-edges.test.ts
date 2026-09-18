import { describe, expect, it } from "vitest";
import { addBranchEdges } from "../src/analyze-flow.js";
import type {
  FlowDefinition,
  StepBranch,
  FlowAnalysis,
  OutEdges,
  SelfReferencedProblem,
  UnknownStepReferenceProblem,
} from "@lcase/types";

describe("addBranchEdges()", () => {
  it("adds one edge per case plus a default edge when there are no problems", () => {
    const fa: FlowAnalysis = {
      inEdges: {},
      outEdges: {},
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const branchStep: StepBranch = {
      type: "branch",
      value: "{{steps.llmweather.exports.data.intent}}",
      cases: {
        forecast: "getforecast",
        airquality: "getairquality",
      },
      default: "unknownintent",
    };

    const flowDef = {
      steps: {
        routeintent: branchStep,
        getforecast: {},
        getairquality: {},
        unknownintent: {},
      },
    } as unknown as FlowDefinition;

    addBranchEdges("routeintent", branchStep, fa, flowDef);

    const expectedOutEdges: OutEdges = {
      routeintent: [
        {
          type: "branch",
          gate: "always",
          startStepId: "routeintent",
          endStepId: "getforecast",
          caseValue: "forecast",
        },
        {
          type: "branch",
          gate: "always",
          startStepId: "routeintent",
          endStepId: "getairquality",
          caseValue: "airquality",
        },
        {
          type: "branch",
          gate: "always",
          startStepId: "routeintent",
          endStepId: "unknownintent",
          isDefault: true,
        },
      ],
    };

    expect(fa.outEdges).toEqual(expectedOutEdges);
    expect(fa.inEdges.getforecast).toEqual([expectedOutEdges.routeintent[0]]);
    expect(fa.inEdges.getairquality).toEqual([expectedOutEdges.routeintent[1]]);
    expect(fa.inEdges.unknownintent).toEqual([expectedOutEdges.routeintent[2]]);
    expect(fa.problems).toEqual([]);
  });

  it("adds an UnknownStepReference problem when a case targets an invalid stepId", () => {
    const fa: FlowAnalysis = {
      inEdges: {},
      outEdges: {},
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const branchStep: StepBranch = {
      type: "branch",
      value: "{{steps.llmweather.exports.data.intent}}",
      cases: { forecast: "missingstep" },
      default: "unknownintent",
    };

    const flowDef = {
      steps: {
        routeintent: branchStep,
        unknownintent: {},
      },
    } as unknown as FlowDefinition;

    addBranchEdges("routeintent", branchStep, fa, flowDef);

    const expectedProblem: UnknownStepReferenceProblem = {
      type: "UnknownStepReference",
      startStepId: "routeintent",
      endStepId: "missingstep",
    };

    expect(fa.problems).toEqual([expectedProblem]);
    expect(fa.outEdges.routeintent).toEqual([
      {
        type: "branch",
        gate: "always",
        startStepId: "routeintent",
        endStepId: "unknownintent",
        isDefault: true,
      },
    ]);
  });

  it("adds a SelfReferenced problem and skips the default edge when default targets itself", () => {
    const fa: FlowAnalysis = {
      inEdges: {},
      outEdges: {},
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const branchStep: StepBranch = {
      type: "branch",
      value: "{{steps.llmweather.exports.data.intent}}",
      cases: { forecast: "getforecast" },
      default: "routeintent",
    };

    const flowDef = {
      steps: {
        routeintent: branchStep,
        getforecast: {},
      },
    } as unknown as FlowDefinition;

    addBranchEdges("routeintent", branchStep, fa, flowDef);

    const expectedProblem: SelfReferencedProblem = {
      type: "SelfReferenced",
      stepId: "routeintent",
    };

    expect(fa.problems).toEqual([expectedProblem]);
    expect(fa.outEdges.routeintent).toEqual([
      {
        type: "branch",
        gate: "always",
        startStepId: "routeintent",
        endStepId: "getforecast",
        caseValue: "forecast",
      },
    ]);
  });
});
