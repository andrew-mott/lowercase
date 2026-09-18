import { describe, expect, it } from "vitest";
import { planJoinEdge } from "../../../src/reducers/utils/plan-join-edge.reducer.js";
import type { Edge, RunContext, StepContext } from "@lcase/types";

function step(status: StepContext["status"]): StepContext {
  return {
    status,
    attempt: 0,
    output: {},
    outputHash: null,
    exportHashes: {},
    resolved: {},
  };
}

// One join ("gather") waiting on two upstream steps, with no outbound edge of
// its own so the completed path stops after settling the join itself.
function makeRun(
  a: StepContext["status"],
  b: StepContext["status"],
): RunContext {
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
    steps: { a: step(a), b: step(b), gather: step("planned") },
    flowAnalysis: {
      inEdges: {},
      outEdges: {},
      nodes: [],
      joinDeps: { gather: ["a", "b"] },
      problems: [],
      refs: [],
    },
  };
}

const joinEdge: Edge = {
  type: "join",
  gate: "always",
  startStepId: "b",
  endStepId: "gather",
};

describe("planJoinEdge()", () => {
  it("completes the join when every dependency completed", () => {
    const run = makeRun("completed", "completed");

    planJoinEdge(joinEdge, run);

    expect(run.steps.gather.status).toBe("completed");
    expect(run.completedSteps.gather).toBe(true);
  });

  it("fails the join when its dependencies finished but not all completed", () => {
    const run = makeRun("completed", "failed");

    planJoinEdge(joinEdge, run);

    expect(run.steps.gather.status).toBe("failed");
    expect(run.failedSteps.gather).toBe(true);
  });

  it("leaves the join alone while a dependency is still running", () => {
    const run = makeRun("completed", "started");

    planJoinEdge(joinEdge, run);

    expect(run.steps.gather.status).toBe("planned");
    expect(run.completedSteps.gather).toBeUndefined();
    expect(run.failedSteps.gather).toBeUndefined();
  });
});
