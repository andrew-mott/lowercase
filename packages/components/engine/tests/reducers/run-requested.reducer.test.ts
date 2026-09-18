import { describe, it, expect } from "vitest";
import { runRequestedReducer } from "../../src/reducers/run-requested.reducer.js";
import type { RunRequestedMsg } from "../../src/types/message.types.js";
import {
  runRequestedNewState,
  runRequestedOldState,
} from "../fixtures/run-requested.state.js";
import { runRequestedEvent } from "../fixtures/run-requested.event.js";
import type { RunContext } from "@lcase/types";
describe("runRequestedReducer", () => {
  it("creates a valid initial state when given a valid message", () => {
    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: runRequestedEvent,
    };
    const state = runRequestedReducer(runRequestedOldState, message);
    expect(state).toEqual(runRequestedNewState);
  });
  it("stores a fork definition hash when it is supplied in an event", () => {
    const eventClone = structuredClone(runRequestedEvent);
    eventClone.data.forkSpecHash = "test-forkspechash";

    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: eventClone,
    };
    const newStateClone = structuredClone(runRequestedNewState);
    newStateClone.runs["test-runid"].forkSpecHash = "test-forkspechash";

    const state = runRequestedReducer(runRequestedOldState, message);
    expect(state).toEqual(newStateClone);
  });

  it("does not change state if runid already exists in state", () => {
    const oldStateClone = structuredClone(runRequestedOldState);
    oldStateClone.runs["test-runid"] = {
      flowDefHash: "existing-hash",
    } as RunContext;

    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: runRequestedEvent,
    };

    const state = runRequestedReducer(oldStateClone, message);
    expect(state).toEqual(oldStateClone);
  });
});
