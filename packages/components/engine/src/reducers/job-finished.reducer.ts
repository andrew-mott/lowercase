import { produce } from "immer";
import type { EngineState, JobFinishedMsg, Reducer } from "../engine.types.js";

export const jobFinishedReducer: Reducer<JobFinishedMsg> = (
  state: EngineState,
  message: JobFinishedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const stepId = message.event.stepid;

    const run = draft.runs[runId];
    if (!run) return;

    const step = run.steps[stepId];
    if (!step) return;

    if (message.event.data.status === "success") {
      step.status = "completed";
      run.completedSteps[stepId] = true;
      delete run.startedSteps[stepId];
    } else if (message.event.data.status === "failure") {
      step.status = "failed";
      run.failedSteps[stepId] = true;
      delete run.startedSteps[stepId];
    }

    step.outputHash = message.event.data.output;
    step.exportHashes = message.event.data.exportHashes ?? {};
    step.output = null;
  });
};
