import { describe, it, expect } from "vitest";
import { runRequestedPlanner } from "../../src/planners/run-requested.planner.js";
import type { RunRequestedMsg } from "../../src/types/message.types.js";
import {
  runRequestedNewState,
  runRequestedOldState,
} from "../fixtures/run-requested.state.js";
import { runRequestedEvent } from "../fixtures/run-requested.event.js";
import type { RunContext } from "@lcase/types";
import type {
  EmitRunDeniedFx,
  GetFlowDefFx,
} from "../../src/types/effect.types.js";
describe("runRequestedPlanner", () => {
  it("creates a GetFlowDefFx for a valid new state", () => {
    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: runRequestedEvent,
    };
    const effects = runRequestedPlanner(
      runRequestedOldState,
      runRequestedNewState,
      message,
    );
    const expectedEffects: GetFlowDefFx[] = [
      {
        type: "GetFlowDef",
        hash: "test-flowdefhash",
        runId: "test-runid",
      },
    ];
    expect(effects).toEqual(expectedEffects);
  });
  it("creates a EmitRunDeniedFx when the run id is already running", () => {
    const oldStateClone = structuredClone(runRequestedOldState);
    oldStateClone.runs["test-runid"] = {
      flowDefHash: "existing-hash",
      status: "started",
    } as RunContext;

    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: runRequestedEvent,
    };
    const effects = runRequestedPlanner(oldStateClone, oldStateClone, message);
    const expectedEffects: EmitRunDeniedFx[] = [
      {
        type: "EmitRunDenied",
        data: {
          error: "Run id already exists in engine.",
        },
        scope: {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          source: "lowercase://engine",
        },
        traceId: "test-traceid",
      },
    ];
    expect(effects).toEqual(expectedEffects);
  });
  it("creates EmitRunDeniedFx if run status = requested but trace id is different", () => {
    const oldStateClone = structuredClone(runRequestedOldState);
    oldStateClone.runs["test-runid"] = {
      flowDefHash: "existing-hash",
      status: "requested",
      traceId: "different-trace-id",
    } as RunContext;

    const message: RunRequestedMsg = {
      type: "RunRequested",
      event: runRequestedEvent,
    };
    const effects = runRequestedPlanner(oldStateClone, oldStateClone, message);
    const expectedEffects: EmitRunDeniedFx[] = [
      {
        type: "EmitRunDenied",
        data: {
          error: "Run id already exists in engine.",
        },
        scope: {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          source: "lowercase://engine",
        },
        traceId: "test-traceid",
      },
    ];
    expect(effects).toEqual(expectedEffects);
  });
});
