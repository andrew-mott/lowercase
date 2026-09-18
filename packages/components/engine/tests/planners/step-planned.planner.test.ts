import { describe, expect, it } from "vitest";
import { runStartedPlanner } from "../../src/planners/run-started.planner.js";
import { runStartedNewState } from "../fixtures/run-started.state.js";
import { runStartedEvent } from "../fixtures/run-started.event.js";
import type {
  EmitStepStartedFx,
  EngineEffect,
  RunStartedMsg,
} from "../../src/engine.types.js";
import { stepPlannedNewState } from "../fixtures/step-planned.state.js";
import type { StepPlannedMsg } from "../../src/types/message.types.js";
import { stepPlannedEvent } from "../fixtures/step-planned.event.js";
import { stepPlannedPlanner } from "../../src/planners/step-planned.planner.js";

describe("stepPlannedPlanner()", () => {
  it("returns an EmitStepStarted and for control flow steps", () => {
    const oldState = runStartedNewState;
    const newState = stepPlannedNewState;
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };

    const stepId = newState.flows["test-flowversionid"].definition.start;
    const stepType =
      newState.flows["test-flowversionid"].definition.steps[stepId].type;

    const expectedEffects: EngineEffect[] = [];
    const expectedStepStartedFx = {
      type: "EmitStepStarted",
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
        status: "started",
      },
      traceId: message.event.traceid,
    } satisfies EmitStepStartedFx;
    expectedEffects.push(expectedStepStartedFx);

    const effects = stepPlannedPlanner(oldState, newState, message);

    expect(effects).toEqual(expectedEffects);
  });

  it("returns no plans when the status is not planned", () => {
    const oldState = runStartedNewState;
    const newState = stepPlannedNewState;
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
