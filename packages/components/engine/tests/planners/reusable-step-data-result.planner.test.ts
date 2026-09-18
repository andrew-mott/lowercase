import { describe, it, expect } from "vitest";
import { reusableStepDataResultPlanner } from "../../src/planners/reusable-step-data-result.planner.js";
import type { ReusableStepDataResultMsg } from "../../src/types/message.types.js";
import { forkSpecOkState } from "../fixtures/fork-spec-result.state.js";
import type {
  EmitRunDeniedFx,
  MakeRunPlanFx,
} from "../../src/types/effect.types.js";
import {
  reusableStepDataResultNotOkState,
  reusableStepDataResultOkState,
} from "../fixtures/reusable-step-data-result.state.js";

describe("reusableStepDataResultPlanner()", () => {
  it("makes a MakeRunPlanFx effect when reusable step data was added to state", () => {
    const message: ReusableStepDataResultMsg = {
      ok: true,
      runId: "test-runid",
      reusableStepData: {
        b: {
          stepId: "b",
          outputHash: "test-outputhash",
        },
      },
      type: "ReusableStepDataResult",
    };

    const effects = reusableStepDataResultPlanner(
      forkSpecOkState,
      reusableStepDataResultOkState,
      message,
    );

    const expectedEffect: MakeRunPlanFx[] = [
      {
        type: "MakeRunPlan",
        runId: "test-runid",
      },
    ];
    expect(effects).toEqual(expectedEffect);
  });
  it("makes a EmitRunDeniedFx effect when reusable step data was not added to state", () => {
    const message: ReusableStepDataResultMsg = {
      ok: false,
      runId: "test-runid",
      type: "ReusableStepDataResult",
      error: "test-error",
    };

    const effects = reusableStepDataResultPlanner(
      forkSpecOkState,
      reusableStepDataResultNotOkState,
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
        traceId: reusableStepDataResultOkState.runs["test-runid"].traceId,
      },
    ];

    expect(effects).toEqual(expectedEffect);
  });
});
