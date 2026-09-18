import { describe, it, expect } from "vitest";
import { stepPlannedReducer } from "../../src/reducers/step-planned.reducer.js";
import { runStartedNewState } from "../fixtures/run-started.state.js";
import type { StepPlannedMsg } from "../../src/types/message.types.js";
import { stepPlannedEvent } from "../fixtures/step-planned.event.js";
import { stepPlannedNewState } from "../fixtures/step-planned.state.js";
describe("stepPlannedReducer", () => {
  it("moves valid planned steps to started status", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };
    const state = stepPlannedReducer(runStartedNewState, message);
    expect(state).toEqual(stepPlannedNewState);
  });
  it("changes nothing if the runid is invalid", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };
    message.event.runid = "invalid-runid";

    const state = stepPlannedReducer(runStartedNewState, message);
    expect(state).toEqual(runStartedNewState);
  });
  it("changes nothing if the stepid is invalid", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };
    message.event.stepid = "invalid-stepid";

    const state = stepPlannedReducer(runStartedNewState, message);
    expect(state).toEqual(runStartedNewState);
  });
  it("changes nothing if the flowid is invalid", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };
    message.event.flowid = "invalid-flowid";

    const state = stepPlannedReducer(runStartedNewState, message);
    expect(state).toEqual(runStartedNewState);
  });
  it("changes nothing if the step status is not 'planned'", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };

    const mutatedState = structuredClone(runStartedNewState);
    mutatedState.runs["test-runid"].steps["b"].status = "initialized";
    mutatedState.runs["test-runid"].steps["parallel"].status = "initialized";

    const state = stepPlannedReducer(mutatedState, message);
    expect(state).toEqual(mutatedState);
  });
  it("changes nothing if the step is not in plannedSteps", () => {
    const message: StepPlannedMsg = {
      type: "StepPlanned",
      event: stepPlannedEvent,
    };

    const mutatedState = structuredClone(runStartedNewState);
    delete mutatedState.runs["test-runid"].plannedSteps["test-stepid"];

    const state = stepPlannedReducer(mutatedState, message);
    expect(state).toEqual(mutatedState);
  });
});
