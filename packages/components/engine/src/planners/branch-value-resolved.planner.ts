import type {
  EmitStepCompletedFx,
  EmitStepFailedFx,
  EngineEffect,
  EngineState,
  Planner,
} from "../engine.types.js";
import type { BranchValueResolvedMsg } from "../types/message.types.js";

export const branchValueResolvedPlanner: Planner<BranchValueResolvedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: BranchValueResolvedMsg,
) => {
  const effects: EngineEffect[] = [];
  const runId = message.runId;
  const stepId = message.stepId;

  const newRunState = newState.runs[runId];
  if (!newRunState) return effects;
  const flow = newState.flows[newRunState.flowVersionId];
  if (!flow) return effects;
  const step = flow.definition.steps[stepId];
  if (!step) return effects;
  const stepCtx = newRunState.steps[stepId];

  if (stepCtx.status === "completed") {
    const emitStepCompletedFx: EmitStepCompletedFx = {
      type: "EmitStepCompleted",
      scope: {
        flowid: newRunState.flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
        stepid: stepId,
        steptype: step.type,
      },
      data: {
        status: "success",
        matchedCase: stepCtx.matchedCase ?? null,
        step: {
          id: stepId,
          name: stepId,
          type: step.type,
        },
      },
      traceId: newRunState.traceId,
    };
    effects.push(emitStepCompletedFx);
  } else if (stepCtx.status === "failed") {
    const emitStepFailedFx: EmitStepFailedFx = {
      type: "EmitStepFailed",
      scope: {
        flowid: newRunState.flowId,
        flowversionid: newRunState.flowVersionId,
        runid: runId,
        source: "lowercase://engine",
        stepid: stepId,
        steptype: step.type,
      },
      data: {
        status: "failure",
        reason: stepCtx.reason ?? "",
        step: {
          id: stepId,
          name: stepId,
          type: step.type,
        },
      },
      traceId: newRunState.traceId,
    };
    effects.push(emitStepFailedFx);
  }

  return effects;
};
