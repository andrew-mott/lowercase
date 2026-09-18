import type {
  Planner,
  EngineEffect,
  EngineState,
  EmitFlowCompletedFx,
  RunFinishedMsg,
  EmitFlowFailedFx,
} from "../engine.types.js";

export const runFinishedPlanner: Planner<RunFinishedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: RunFinishedMsg,
): EngineEffect[] => {
  const effects: EngineEffect[] = [];
  const runId = message.event.runid;

  const newRunState = newState.runs[runId];
  if (!newRunState) return effects;
  const flowId = newRunState.flowId;
  const flow = newState.flows[newRunState.flowVersionId];
  if (!flow) return effects;

  if (newRunState.status === "completed") {
    const effect = {
      type: "EmitFlowCompleted",
      data: {
        flow: {
          id: flowId,
          name: flow.definition.name,
          version: flow.definition.version,
        },
        run: { id: runId },
        status: "success",
      },
      scope: {
        flowid: flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
      },
      traceId: newState.runs[runId].traceId,
    } satisfies EmitFlowCompletedFx;
    effects.push(effect);
  } else if (newRunState.status === "failed") {
    const effect: EmitFlowFailedFx = {
      type: "EmitFlowFailed",
      data: {
        flow: {
          id: flowId,
          name: flow.definition.name,
          version: flow.definition.version,
        },
        run: { id: runId },
        status: "failure",
      },
      scope: {
        flowid: flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
      },
      traceId: newState.runs[runId].traceId,
    };
    effects.push(effect);
  }

  return effects;
};
