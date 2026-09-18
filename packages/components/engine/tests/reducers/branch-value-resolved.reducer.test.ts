import { describe, expect, it } from "vitest";
import { branchValueResolvedReducer } from "../../src/reducers/branch-value-resolved.reducer.js";
import type { BranchValueResolvedMsg } from "../../src/types/message.types.js";
import type { EngineState } from "../../src/engine.types.js";

function makeState(): EngineState {
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
        startedSteps: { routeintent: true },
        plannedSteps: {},
        completedSteps: {},
        failedSteps: {},
        outstandingSteps: 1,
        status: "started",
        steps: {
          routeintent: {
            status: "started",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
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
    flows: {},
  };
}

describe("branchValueResolvedReducer()", () => {
  it("marks the step completed with the resolved matchedCase", () => {
    const state = makeState();
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: true,
      matchedCase: "forecast",
    };

    const newState = branchValueResolvedReducer(state, message);

    const step = newState.runs["test-runid"].steps.routeintent;
    expect(step.status).toBe("completed");
    expect(step.matchedCase).toBe("forecast");
    expect(newState.runs["test-runid"].completedSteps.routeintent).toBe(true);
    expect(
      newState.runs["test-runid"].startedSteps.routeintent,
    ).toBeUndefined();
  });

  it("marks the step completed with matchedCase null when it fell to default", () => {
    const state = makeState();
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: true,
      matchedCase: null,
    };

    const newState = branchValueResolvedReducer(state, message);

    expect(
      newState.runs["test-runid"].steps.routeintent.matchedCase,
    ).toBeNull();
  });

  it("marks the step failed when resolution errors", () => {
    const state = makeState();
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: false,
      error: "could not resolve",
    };

    const newState = branchValueResolvedReducer(state, message);

    const step = newState.runs["test-runid"].steps.routeintent;
    expect(step.status).toBe("failed");
    expect(step.reason).toBe("could not resolve");
    expect(newState.runs["test-runid"].failedSteps.routeintent).toBe(true);
  });
});
