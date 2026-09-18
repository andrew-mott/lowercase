import { describe, expect, it } from "vitest";
import { runStartedPlanner } from "../../src/planners/run-started.planner.js";
import { runStartedNewState } from "../fixtures/run-started.state.js";
import { runStartedEvent } from "../fixtures/run-started.event.js";
import type {
  EmitStepPlannedFx,
  RunStartedMsg,
} from "../../src/engine.types.js";
import { makeRunPlanNewState } from "../fixtures/make-run-plan.state.js";

describe("runStartedPlanner", () => {
  it("returns a EmitStepPlannedFx when step status moves to planned", () => {
    const oldState = makeRunPlanNewState;
    const newState = runStartedNewState;
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };

    const stepId = newState.flows["test-flowversionid"].definition.start;
    const stepType =
      newState.flows["test-flowversionid"].definition.steps[stepId].type;
    const expectedEffects = {
      type: "EmitStepPlanned",
      scope: {
        flowid: message.event.flowid,
        flowversionid: message.event.flowversionid,
        runid: message.event.runid,
        stepid: stepId,
        steptype: stepType,
      },
      data: {
        step: {
          id: stepId,
          name: stepId,
          type: stepType,
        },
      },
      traceId: message.event.traceid,
    } satisfies EmitStepPlannedFx;

    const effects = runStartedPlanner(oldState, newState, message);

    expect(effects).toEqual([expectedEffects]);
  });

  it("returns no plans when the status is not planned", () => {
    const oldState = makeRunPlanNewState;
    const newState = runStartedNewState;
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };
    const stepId = newState.flows["test-flowversionid"].definition.start;
    newState.runs["test-runid"].steps[stepId].status = "initialized";

    const effects = runStartedPlanner(oldState, newState, message);
    expect(effects).toEqual([]);
  });
});
