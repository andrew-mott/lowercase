import type { EngineEffect, EngineState, Planner } from "../engine.types.js";
import type { EmitRunDeniedFx, GetFlowDefFx } from "../types/effect.types.js";
import type { RunRequestedMsg } from "../types/message.types.js";

export const runRequestedPlanner: Planner<RunRequestedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: RunRequestedMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.event.runid;
  const traceId = message.event.traceid;

  const newRunState = newState.runs[runId];

  // no effect if run is already already exists in state
  if (newRunState.status !== "requested" || traceId !== newRunState.traceId) {
    const fx: EmitRunDeniedFx = {
      type: "EmitRunDenied",
      data: {
        error: "Run id already exists in engine.",
      },
      scope: {
        flowid: message.event.flowid,
        flowversionid: message.event.flowversionid,
        runid: runId,
        source: "lowercase://engine",
      },
      traceId: message.event.traceid,
    };
    effects.push(fx);
    return effects;
  }

  const getFlowDefFx: GetFlowDefFx = {
    type: "GetFlowDef",
    hash: newRunState.flowDefHash,
    runId,
  };
  effects.push(getFlowDefFx);
  return effects;
};
