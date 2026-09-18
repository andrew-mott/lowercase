import { describe, expect, it } from "vitest";
import { stepFinishedReducer } from "../../src/reducers/step-finished.reducer.js";
import type { EngineState } from "../../src/engine.types.js";
import type { StepFinishedMsg } from "../../src/types/message.types.js";
import type { AnyEvent } from "@lcase/types";

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
        startedSteps: {},
        plannedSteps: {},
        completedSteps: { routeintent: true },
        failedSteps: {},
        outstandingSteps: 1,
        status: "started",
        steps: {
          routeintent: {
            status: "completed",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
            matchedCase: "forecast",
          },
          getforecast: {
            status: "initialized",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
          getairquality: {
            status: "initialized",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
          unknownintent: {
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
          outEdges: {
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
          },
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

function makeMessage(matchedCase: string | null): StepFinishedMsg {
  return {
    type: "StepFinished",
    event: {
      type: "step.completed",
      runid: "test-runid",
      stepid: "routeintent",
      data: {
        status: "success",
        matchedCase,
        step: { id: "routeintent", name: "routeintent", type: "branch" },
      },
    } as unknown as AnyEvent<"step.completed">,
  };
}

describe("stepFinishedReducer() branch dispatch", () => {
  it("opens only the matching case edge", () => {
    const state = makeState();
    const message = makeMessage("forecast");

    const newState = stepFinishedReducer(state, message);
    const steps = newState.runs["test-runid"].steps;

    expect(steps.getforecast.status).toBe("planned");
    expect(steps.getairquality.status).toBe("initialized");
    expect(steps.unknownintent.status).toBe("initialized");
  });

  it("opens only the default edge when matchedCase is null", () => {
    const state = makeState();
    const message = makeMessage(null);

    const newState = stepFinishedReducer(state, message);
    const steps = newState.runs["test-runid"].steps;

    expect(steps.getforecast.status).toBe("initialized");
    expect(steps.getairquality.status).toBe("initialized");
    expect(steps.unknownintent.status).toBe("planned");
  });
});
