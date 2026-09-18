import { describe, it, expect } from "vitest";
import { forkSpecResultPlanner } from "../../src/planners/fork-spec-result.planner.js";
import type { ForkSpecResultMsg } from "../../src/types/message.types.js";
import { flowDefResultOkStateForkSpecHash } from "../fixtures/flow-def-result.state.js";
import {
  forkSpecNotOkState,
  forkSpecOkState,
} from "../fixtures/fork-spec-result.state.js";
import type {
  EmitRunDeniedFx,
  GetReusableStepDataFx,
} from "../../src/types/effect.types.js";

describe("forkSpecResultPlanner()", () => {
  it("makes a GetReusableStepDataFx effect when a forkSpec with parentRunId is in new state", () => {
    const message: ForkSpecResultMsg = {
      ok: true,
      type: "ForkSpecResult",
      runId: "test-runid",
      forkSpec: {
        parentRunId: "test-parentrunid",
        reuse: ["b"],
      },
    };

    const effects = forkSpecResultPlanner(
      flowDefResultOkStateForkSpecHash,
      forkSpecOkState,
      message,
    );

    const expectedEffect: GetReusableStepDataFx[] = [
      {
        type: "GetReusableStepData",
        parentRunId: "test-parentrunid",
        stepIds: ["b"],
        runId: "test-runid",
      },
    ];
    expect(effects).toEqual(expectedEffect);
  });
  it("make EmitRunDeniedFx effect when run status is failed and message ok is false", () => {
    const message: ForkSpecResultMsg = {
      ok: false,
      type: "ForkSpecResult",
      runId: "test-runid",
      error: "test-error",
    };

    const effects = forkSpecResultPlanner(
      flowDefResultOkStateForkSpecHash,
      forkSpecNotOkState,
      message,
    );

    const expectedEffect: EmitRunDeniedFx[] = [
      {
        type: "EmitRunDenied",
        data: {
          error: "test-error",
        },
        scope: {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          source: "lowercase://engine",
        },
        traceId: forkSpecNotOkState.runs["test-runid"].traceId,
      },
    ];
    expect(effects).toEqual(expectedEffect);
  });
});
