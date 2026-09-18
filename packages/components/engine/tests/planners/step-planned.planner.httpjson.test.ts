import { describe, expect, it } from "vitest";
import type { RunContext, AnyEvent } from "@lcase/types";
import type {
  EngineState,
  PublishJobHttpJsonSubmittedFx,
} from "../../src/engine.types.js";
import type { StepPlannedMsg } from "../../src/types/message.types.js";
import { stepPlannedPlanner } from "../../src/planners/step-planned.planner.js";
import { flowDef } from "../fixtures/flow-definition.js";
import { flowAnalysisB } from "../fixtures/flow-analysis.state.js";

// The shared step-planned.state.ts fixture puts step "b" in runPlan.reuse,
// which takes stepPlannedPlanner's early-return EmitStepReused branch -- this
// fixture instead reaches the real httpjson dispatch branch, which is the only
// place the submitted topic effect is built.
function makeNewState(): EngineState {
  return {
    runs: {
      "test-runid": {
        flowId: "test-flowid",
        flowVersionId: "test-flowversionid",
        flowDefHash: "test-flowdefhash",
        forkSpecHash: "test-forkspechash",
        runId: "test-runid",
        traceId: "test-traceid",
        params: {},
        runPlan: { reuse: {} },
        startedSteps: { parallel: true },
        plannedSteps: {},
        completedSteps: {},
        failedSteps: {},
        outstandingSteps: 1,
        input: {},
        status: "started",
        steps: {
          b: {
            status: "initialized",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
          parallel: {
            status: "started",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
        },
        flowAnalysis: flowAnalysisB,
      } satisfies RunContext,
    },
    flows: {
      "test-flowversionid": {
        definition: flowDef,
        runIds: { "test-runid": true },
      },
    },
  };
}

function makeMessage(): StepPlannedMsg {
  return {
    type: "StepPlanned",
    event: {
      data: { step: { id: "b", name: "b", type: "httpjson" } },
      id: "test-id",
      source: "test-source",
      specversion: "1.0",
      time: "test-time",
      type: "step.planned",
      domain: "step",
      action: "planned",
      traceparent: "test-traceparent",
      traceid: "test-traceid",
      spanid: "test-spanid",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
      stepid: "b",
      steptype: "httpjson",
    } satisfies AnyEvent<"step.planned">,
  };
}

describe("stepPlannedPlanner() -- httpjson step", () => {
  it("pushes one PublishJobHttpJsonSubmitted effect and no direct execution effect", () => {
    const oldState = makeNewState();
    const newState = makeNewState();
    const message = makeMessage();

    const effects = stepPlannedPlanner(oldState, newState, message);

    const published = effects.filter(
      (e) => e.type === "PublishJobHttpJsonSubmitted",
    ) as PublishJobHttpJsonSubmittedFx[];

    // One effect, not a pair: publishing the submitted Message is the dispatch,
    // so there is no second object left that could carry a different jobid.
    expect(published).toHaveLength(1);
    expect(published[0]!.data.url).toBe("test-url");
    expect(published[0]!.scope).toMatchObject({
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
      stepid: "b",
      capid: "httpjson",
      toolid: "httpjson",
    });
    expect(published[0]!.scope.jobid).toEqual(expect.any(String));
  });
});
