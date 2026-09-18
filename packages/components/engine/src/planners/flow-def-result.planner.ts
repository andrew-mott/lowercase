import type { EngineEffect, EngineState, Planner } from "../engine.types.js";
import type {
  EmitRunDeniedFx,
  GetForkSpecFx,
  MakeRunPlanFx,
} from "../types/effect.types.js";
import type { FlowDefResultMsg } from "../types/message.types.js";

export const flowDefResultPlanner: Planner<FlowDefResultMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: FlowDefResultMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.runId;

  const newRunState = newState.runs[runId];

  if (!newRunState) return effects;
  if (newRunState.status === "failed" && message.ok === false) {
    // emit denied
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

  if (newRunState.forkSpecHash !== undefined) {
    //emit getFlowSpec
    const fx: GetForkSpecFx = {
      type: "GetForkSpec",
      hash: newRunState.forkSpecHash,
      runId,
    };
    effects.push(fx);
    return effects;
  }

  const fx: MakeRunPlanFx = {
    type: "MakeRunPlan",
    runId,
  };

  effects.push(fx);

  return effects;
};
