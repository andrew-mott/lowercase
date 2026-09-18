import { describe, it, expect } from "vitest";
import { runStartedReducer } from "../../src/reducers/run-started.reducer.js";
import type { EngineState, RunStartedMsg } from "../../src/engine.types.js";
import { runStartedEvent } from "../fixtures/run-started.event.js";
import { runStartedNewState } from "../fixtures/run-started.state.js";
import { makeRunPlanNewState } from "../fixtures/make-run-plan.state.js";

describe("runStartedReducer", () => {
  it("updates start step + run status to planned when state is initialized", () => {
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };

    const state = runStartedReducer(makeRunPlanNewState, message);
    expect(state).toEqual(runStartedNewState);
  });
  it("makes no changes when no run context is found for runid", () => {
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };

    // state the flowSubmittedReducer produced
    const oldState: EngineState = structuredClone(makeRunPlanNewState);

    delete oldState.runs["test-runid"];

    const state = runStartedReducer(oldState, message);
    expect(state).toEqual(oldState);
  });
  it("makes no changes when no flow context is found for flowid", () => {
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };

    // state the flowSubmittedReducer produced
    const oldState: EngineState = structuredClone(makeRunPlanNewState);

    delete oldState.flows["test-flowversionid"];

    const state = runStartedReducer(oldState, message);
    expect(state).toEqual(oldState);
  });
  it("makes no changes when no valid start step is found in flow definition", () => {
    const message: RunStartedMsg = {
      type: "RunStarted",
      event: runStartedEvent,
    };

    // state the flowSubmittedReducer produced
    const oldState: EngineState = structuredClone(makeRunPlanNewState);

    oldState.flows["test-flowversionid"].definition.start = "";

    const state = runStartedReducer(oldState, message);
    expect(state).toEqual(oldState);
  });
});
