import type { EngineEffect, EngineState, Planner } from "../engine.types.js";
import type {
  EmitRunDeniedFx,
  GetReusableStepDataFx,
} from "../types/effect.types.js";
import type { ForkSpecResultMsg } from "../types/message.types.js";

export const forkSpecResultPlanner: Planner<ForkSpecResultMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: ForkSpecResultMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.runId;
  const newRunState = newState.runs[runId];

  if (!newRunState) return effects;

  if (newRunState.status === "failed" && message.ok === false) {
    const fx: EmitRunDeniedFx = {
      type: "EmitRunDenied",
      data: {
        error: message.error,
      },
      scope: {
        flowid: newRunState.flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
      },
      traceId: newRunState.traceId,
    };
    effects.push(fx);
    return effects;
  }

  if (newRunState.forkSpec?.parentRunId) {
    const fx: GetReusableStepDataFx = {
      type: "GetReusableStepData",
      parentRunId: newRunState.forkSpec.parentRunId,
      stepIds: newRunState.forkSpec.reuse,
      runId,
    };
    effects.push(fx);
  }

  // in the future, if a run is forked without changes, maybe go straight to
  // make run plan, but currently forked implies changes

  return effects;
};
