import { describe, it, expect } from "vitest";
import { reusableStepDataResultReducer } from "../../src/reducers/reusable-step-data-result.reducer.js";
import type { ReusableStepDataResultMsg } from "../../src/types/message.types.js";

import { forkSpecOkState } from "../fixtures/fork-spec-result.state.js";
import {
  reusableStepDataResultNotOkState,
  reusableStepDataResultOkState,
} from "../fixtures/reusable-step-data-result.state.js";

describe("reusableStepDataResultReducer()", () => {
  it("adds reusable step data to state when result returns true", () => {
    const message: ReusableStepDataResultMsg = {
      ok: true,
      runId: "test-runid",
      reusableStepData: {
        b: {
          stepId: "b",
          outputHash: "test-outputhash",
          status: "success",
        },
      },
      type: "ReusableStepDataResult",
    };
    const state = reusableStepDataResultReducer(forkSpecOkState, message);
    expect(state).toEqual(reusableStepDataResultOkState);
  });
  it("sets run state to failed when message is not ok", () => {
    const message: ReusableStepDataResultMsg = {
      ok: false,
      runId: "test-runid",
      type: "ReusableStepDataResult",
      error: "test-error",
    };
    const state = reusableStepDataResultReducer(forkSpecOkState, message);
    expect(state).toEqual(reusableStepDataResultNotOkState);
  });
});
