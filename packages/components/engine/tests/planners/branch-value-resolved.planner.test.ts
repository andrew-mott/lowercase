import { describe, expect, it } from "vitest";
import { branchValueResolvedPlanner } from "../../src/planners/branch-value-resolved.planner.js";
import type { BranchValueResolvedMsg } from "../../src/types/message.types.js";
import type { EngineState } from "../../src/engine.types.js";
import type { FlowDefinition } from "@lcase/types";

const flowDef: FlowDefinition = {
  name: "test-flow",
  version: "v1",
  start: "routeintent",
  steps: {
    routeintent: {
      type: "branch",
      value: "{{steps.llmweather.exports.data.intent}}",
      cases: { forecast: "getforecast" },
      default: "unknownintent",
    },
  },
};

function makeState(
  stepStatus: "completed" | "failed",
  matchedCase: string | null,
  reason?: string,
): EngineState {
  return {
    runs: {
      "test-runid": {
        flowId: "test-flowid",
        flowVersionId: "test-flowversionid",
        flowDefHash: "test-flowdefhash",
        runId: "test-runid",
        traceId: "test-traceid",
        params: {},
        input: {},
        runPlan: { reuse: {} },
        startedSteps: {},
        plannedSteps: {},
        completedSteps: {},
        failedSteps: {},
        outstandingSteps: 0,
        status: "started",
        steps: {
          routeintent: {
            status: stepStatus,
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
            matchedCase,
            ...(reason ? { reason } : {}),
          },
        },
        flowAnalysis: {
          inEdges: {},
          outEdges: {},
          nodes: [],
          joinDeps: {},
          problems: [],
          refs: [],
        },
      },
    },
    flows: {
      "test-flowversionid": {
        definition: flowDef,
        runIds: { "test-runid": true },
      },
    },
  };
}

describe("branchValueResolvedPlanner()", () => {
  it("emits EmitStepCompleted with the matchedCase when resolution succeeded", () => {
    const state = makeState("completed", "forecast");
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: true,
      matchedCase: "forecast",
    };

    const effects = branchValueResolvedPlanner(state, state, message);

    expect(effects).toEqual([
      {
        type: "EmitStepCompleted",
        scope: {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          source: "lowercase://engine",
          stepid: "routeintent",
          steptype: "branch",
        },
        data: {
          status: "success",
          matchedCase: "forecast",
          step: { id: "routeintent", name: "routeintent", type: "branch" },
        },
        traceId: "test-traceid",
      },
    ]);
  });

  it("emits EmitStepFailed with the reason when resolution failed", () => {
    const state = makeState("failed", null, "could not resolve");
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: false,
      error: "could not resolve",
    };

    const effects = branchValueResolvedPlanner(state, state, message);

    expect(effects).toEqual([
      {
        type: "EmitStepFailed",
        scope: {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          source: "lowercase://engine",
          stepid: "routeintent",
          steptype: "branch",
        },
        data: {
          status: "failure",
          reason: "could not resolve",
          step: { id: "routeintent", name: "routeintent", type: "branch" },
        },
        traceId: "test-traceid",
      },
    ]);
  });
});
