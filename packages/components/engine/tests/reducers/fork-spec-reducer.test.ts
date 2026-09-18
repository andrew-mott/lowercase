import { describe, it, expect } from "vitest";
import { forkSpecResultReducer } from "../../src/reducers/fork-spec-result.reducer.js";
import type { ForkSpecResultMsg } from "../../src/types/message.types.js";
import { flowDefResultOkState } from "../fixtures/flow-def-result.state.js";
import {
  forkSpecNotOkState,
  forkSpecOkState,
} from "../fixtures/fork-spec-result.state.js";

describe("forkSpecReducer()", () => {
  it("adds fork spec to state when result returns true", () => {
    const stateWithForkSpec = structuredClone(flowDefResultOkState);
    stateWithForkSpec.runs["test-runid"].forkSpecHash = "test-forkspechash";
    const message: ForkSpecResultMsg = {
      ok: true,
      type: "ForkSpecResult",
      runId: "test-runid",
      forkSpec: {
        parentRunId: "test-parentrunid",
        reuse: ["b"],
      },
    };
    const state = forkSpecResultReducer(stateWithForkSpec, message);
    expect(state).toEqual(forkSpecOkState);
  });
  it("changes run status to failed when fork spec returns false", () => {
    const stateWithForkSpec = structuredClone(flowDefResultOkState);
    stateWithForkSpec.runs["test-runid"].forkSpecHash = "test-forkspechash";
    const message: ForkSpecResultMsg = {
      ok: false,
      type: "ForkSpecResult",
      runId: "test-runid",
      error: "test-error",
    };
    const state = forkSpecResultReducer(stateWithForkSpec, message);
    expect(state).toEqual(forkSpecNotOkState);
  });
});
