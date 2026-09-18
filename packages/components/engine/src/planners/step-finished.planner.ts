import type {
  EmitRunCompletedFx,
  EmitRunFailedFx,
  EmitStepPlannedFx,
  EngineEffect,
  EngineState,
  Planner,
} from "../engine.types.js";
import {} from "../engine.types.js";
import type { StepFinishedMsg } from "../types/message.types.js";

export const stepFinishedPlanner: Planner<StepFinishedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: StepFinishedMsg,
): EngineEffect[] => {
  const effects: EngineEffect[] = [];

  const runId = message.event.runid;

  const oldRun = oldState.runs[runId];
  const newRun = newState.runs[runId];

  if (!newRun || !oldRun) return effects;
  const flow = newState.flows[newRun.flowVersionId];
  if (!flow) return effects;

  const newPlannedStepIds = Object.keys(newRun.plannedSteps).filter(
    (id) => oldRun.plannedSteps[id] === undefined,
  );

  for (const plannedStepId of newPlannedStepIds) {
    if (oldRun.steps[plannedStepId].status !== "initialized") continue;
    const step = flow.definition.steps[plannedStepId];
    if (!step) continue;

    const emitStepPlannedFx: EmitStepPlannedFx = {
      type: "EmitStepPlanned",
      scope: {
        flowid: newRun.flowId,
        flowversionid: newRun.flowVersionId,
        runid: runId,
        stepid: plannedStepId,
        steptype: step.type,
      },
      data: {
        step: {
          id: plannedStepId,
          name: plannedStepId,
          type: step.type,
        },
      },
      traceId: newRun.traceId,
    };
    effects.push(emitStepPlannedFx);
  }

  if (newRun.outstandingSteps === 0 && newRun.status === "completed") {
    const emitRunCompletedFx: EmitRunCompletedFx = {
      type: "EmitRunCompleted",
      scope: {
        flowid: newRun.flowId,
        flowversionid: newRun.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
      },
      data: null,
      traceId: newRun.traceId,
    };
    effects.push(emitRunCompletedFx);
  } else if (newRun.outstandingSteps === 0 && newRun.status === "failed") {
    const emitRunFailedFx: EmitRunFailedFx = {
      type: "EmitRunFailed",
      scope: {
        flowid: newRun.flowId,
        flowversionid: newRun.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
      },
      data: null,
      traceId: newRun.traceId,
    };
    effects.push(emitRunFailedFx);
  }

  return effects;
};
