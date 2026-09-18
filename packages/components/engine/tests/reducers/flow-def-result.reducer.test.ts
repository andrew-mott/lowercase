import { describe, it, expect } from "vitest";
import { flowDefResultReducer } from "../../src/reducers/flow-def-result.reducer.js";
import type { FlowDefResultMsg } from "../../src/types/message.types.js";
import { runRequestedNewState } from "../fixtures/run-requested.state.js";
import { flowDef } from "../fixtures/flow-definition.js";
import {
  flowDefResultNotOkState,
  flowDefResultOkState,
} from "../fixtures/flow-def-result.state.js";

describe("flowDefResultReducer()", () => {
  it("creates a state with a flow def state when flow def returns ok", () => {
    const message: FlowDefResultMsg = {
      ok: true,
      type: "FlowDefResult",
      runId: "test-runid",
      def: flowDef,
    };
    const state = flowDefResultReducer(runRequestedNewState, message);
    expect(state).toEqual(flowDefResultOkState);
  });
  it("marks run status as 'failed' when flow def returns ok: false", () => {
    const message: FlowDefResultMsg = {
      ok: false,
      type: "FlowDefResult",
      runId: "test-runid",
      error: "error",
    };
    const state = flowDefResultReducer(runRequestedNewState, message);
    expect(state).toEqual(flowDefResultNotOkState);
  });
});
