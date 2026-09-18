import type {
  EmitStepCompletedFx,
  EmitStepPlannedFx,
  EngineEffect,
  EngineState,
  Planner,
} from "../engine.types.js";
import type { StepStartedMsg } from "../types/message.types.js";

export const stepStartedPlanner: Planner<StepStartedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: StepStartedMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.event.runid;
  const stepId = message.event.stepid;
  const stepType = message.event.steptype;

  const oldRunState = oldState.runs[runId];
  const newRunState = newState.runs[runId];

  if (!newRunState || !oldRunState) return effects;
  const flowDef = newState.flows[newRunState.flowVersionId];
  if (!flowDef) return effects;

  const fa = newRunState.flowAnalysis;

  const stepDef = flowDef.definition.steps[stepId];
  if (!stepDef) return effects;

  if (stepType === "parallel") {
    for (const edge of fa.outEdges[stepId]) {
      const step = newRunState.steps[edge.endStepId];
      if (!step) continue;
      if (step.status !== "planned") continue;
      const emitStepPlanned: EmitStepPlannedFx = {
        type: "EmitStepPlanned",
        scope: {
          flowid: newRunState.flowId,
          flowversionid: newRunState.flowVersionId,
          runid: runId,
          stepid: edge.endStepId,
          steptype: flowDef.definition.steps[edge.endStepId].type,
        },
        data: {
          step: {
            id: edge.endStepId,
            name: edge.endStepId,
            type: flowDef.definition.steps[edge.endStepId].type,
          },
        },
        traceId: newRunState.traceId,
      };
      effects.push(emitStepPlanned);
    }
  }

  // used for parallel steps that complete when all steps have started
  const completedSteps = Object.keys(newRunState.completedSteps).filter(
    (stepId) => oldRunState.completedSteps[stepId] === undefined,
  );

  for (const completedStepId of completedSteps) {
    const emitStepCompletedFx: EmitStepCompletedFx = {
      type: "EmitStepCompleted",
      scope: {
        flowid: newRunState.flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
        stepid: completedStepId,
        steptype: flowDef.definition.steps[completedStepId].type,
      },
      data: {
        status: "success",
        step: {
          id: completedStepId,
          name: completedStepId,
          type: flowDef.definition.steps[completedStepId].type,
        },
      },
      traceId: newRunState.traceId,
    };
    effects.push(emitStepCompletedFx);
  }

  return effects;
};
