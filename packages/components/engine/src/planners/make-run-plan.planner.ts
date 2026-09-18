import type {
  EmitRunStartedFx,
  EngineEffect,
  EngineState,
  Planner,
} from "../engine.types.js";
import type { EmitRunDeniedFx } from "../types/effect.types.js";
import type { MakeRunPlanMsg } from "../types/message.types.js";

export const makeRunPlanPlanner: Planner<MakeRunPlanMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: MakeRunPlanMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.runId;
  const newRunState = newState.runs[runId];

  if (!newRunState) return effects;

  if (newRunState.status !== "started") {
    const fx: EmitRunDeniedFx = {
      type: "EmitRunDenied",
      data: {
        error: "Error making run plan.",
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

  const fx: EmitRunStartedFx = {
    type: "EmitRunStarted",
    scope: {
      flowid: newRunState.flowId,
      flowversionid: newRunState.flowVersionId,
      runid: runId,
      source: "lowercase://engine",
    },
    data: null,
    traceId: newRunState.traceId,
  };

  effects.push(fx);

  return effects;
};
