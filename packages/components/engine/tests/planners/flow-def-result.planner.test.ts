import { describe, it, expect } from "vitest";
import { flowDefResultPlanner } from "../../src/planners/flow-def-result.planner.js";
import type { FlowDefResultMsg } from "../../src/types/message.types.js";
import { runRequestedNewState } from "../fixtures/run-requested.state.js";
import { flowDef } from "../fixtures/flow-definition.js";
import { flowDefResultOkState } from "../fixtures/flow-def-result.state.js";
import type {
  EmitRunDeniedFx,
  GetForkSpecFx,
  MakeRunPlanFx,
} from "../../src/types/effect.types.js";

describe("flowDefResultPlanner()", () => {
  it("creates a make run plan effect when no fork spec is given", () => {
    const message: FlowDefResultMsg = {
      ok: true,
      type: "FlowDefResult",
      runId: "test-runid",
      def: flowDef,
    };
    const effects = flowDefResultPlanner(
      runRequestedNewState,
      flowDefResultOkState,
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
  it("creates a GetForkSpec effect when no fork spec hash is given", () => {
    const stateWitHForkSpec = structuredClone(flowDefResultOkState);
    stateWitHForkSpec.runs["test-runid"].forkSpecHash = "test-forkspechash";

    const message: FlowDefResultMsg = {
      ok: true,
      type: "FlowDefResult",
      runId: "test-runid",
      def: flowDef,
    };
    const effects = flowDefResultPlanner(
      runRequestedNewState,
      stateWitHForkSpec,
      message,
    );

    const expectedEffect: GetForkSpecFx[] = [
      {
        type: "GetForkSpec",
        hash: "test-forkspechash",
        runId: "test-runid",
      },
    ];
    expect(effects).toEqual(expectedEffect);
  });

  it("creates a EmitRunDenied effect when fork def result is not ok", () => {
    const statWithFailedStatus = structuredClone(flowDefResultOkState);
    statWithFailedStatus.runs["test-runid"].status = "failed";

    const message: FlowDefResultMsg = {
      ok: false,
      type: "FlowDefResult",
      runId: "test-runid",
      error: "test-error",
    };
    const effects = flowDefResultPlanner(
      runRequestedNewState,
      statWithFailedStatus,
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
        traceId: statWithFailedStatus.runs["test-runid"].traceId,
      },
    ];
    expect(effects).toEqual(expectedEffect);
  });
});
