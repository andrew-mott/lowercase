import { describe, expect, it } from "vitest";
import { planBranchEdge } from "../../../src/reducers/utils/plan-branch-edge.reducer.js";
import type { Edge, RunContext } from "@lcase/types";

function makeRun(): RunContext {
  return {
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
      target: {
        status: "initialized",
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
  };
}

describe("planBranchEdge()", () => {
  it("opens the matching case edge", () => {
    const run = makeRun();
    const edge: Edge = {
      type: "branch",
      gate: "always",
      startStepId: "routeintent",
      endStepId: "target",
      caseValue: "forecast",
    };

    planBranchEdge(edge, run, "forecast");

    expect(run.steps.target.status).toBe("planned");
    expect(run.outstandingSteps).toBe(1);
    expect(run.plannedSteps.target).toBe(true);
  });

  it("does not open a case edge when the matchedCase differs", () => {
    const run = makeRun();
    const edge: Edge = {
      type: "branch",
      gate: "always",
      startStepId: "routeintent",
      endStepId: "target",
      caseValue: "airquality",
    };

    planBranchEdge(edge, run, "forecast");

    expect(run.steps.target.status).toBe("initialized");
    expect(run.outstandingSteps).toBe(0);
  });

  it("opens the default edge when matchedCase is null", () => {
    const run = makeRun();
    const edge: Edge = {
      type: "branch",
      gate: "always",
      startStepId: "routeintent",
      endStepId: "target",
      isDefault: true,
    };

    planBranchEdge(edge, run, null);

    expect(run.steps.target.status).toBe("planned");
  });

  it("does not open the default edge when a case matched", () => {
    const run = makeRun();
    const edge: Edge = {
      type: "branch",
      gate: "always",
      startStepId: "routeintent",
      endStepId: "target",
      isDefault: true,
    };

    planBranchEdge(edge, run, "forecast");

    expect(run.steps.target.status).toBe("initialized");
  });

  it("does nothing when the target step is already past initialized", () => {
    const run = makeRun();
    run.steps.target.status = "completed";
    const edge: Edge = {
      type: "branch",
      gate: "always",
      startStepId: "routeintent",
      endStepId: "target",
      caseValue: "forecast",
    };

    planBranchEdge(edge, run, "forecast");

    expect(run.steps.target.status).toBe("completed");
    expect(run.outstandingSteps).toBe(0);
  });
});
