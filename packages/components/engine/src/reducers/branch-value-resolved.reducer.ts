import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { BranchValueResolvedMsg } from "../types/message.types.js";

export const branchValueResolvedReducer: Reducer<BranchValueResolvedMsg> = (
  state: EngineState,
  message: BranchValueResolvedMsg,
) => {
  return produce(state, (draft) => {
    const run = draft.runs[message.runId];
    if (!run) return;
    const step = run.steps[message.stepId];
    if (!step) return;

    if (message.ok) {
      step.status = "completed";
      step.matchedCase = message.matchedCase;
      run.completedSteps[message.stepId] = true;
      delete run.startedSteps[message.stepId];
    } else {
      step.status = "failed";
      step.reason = message.error;
      run.failedSteps[message.stepId] = true;
      delete run.startedSteps[message.stepId];
    }
  });
};
