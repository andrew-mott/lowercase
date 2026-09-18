import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { StepFinishedMsg } from "../types/message.types.js";
import { planControlEdge } from "./utils/plan-control-edge.reducer.js";
import { planJoinEdge } from "./utils/plan-join-edge.reducer.js";
import { planBranchEdge } from "./utils/plan-branch-edge.reducer.js";
import { setRunStatus } from "./utils/set-run-status.reducer.js";

/**
 * Check the step which this job belongs to and see what the policy is for
 * retries / completion.  If completed, move status to completed and have
 * planner emit step.completed.  If failed, emit step.failed, possibly
 * step.retried/planned if it is retrying or re-executing.
 */
export const stepFinishedReducer: Reducer<StepFinishedMsg> = (
  state: EngineState,
  message: StepFinishedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const stepId = message.event.stepid;

    const run = draft.runs[runId];
    const step = run.steps[stepId];

    if (!run) return;
    if (!step) return;

    const fa = run.flowAnalysis;

    run.outstandingSteps = Math.abs(run.outstandingSteps - 1);

    if (fa.outEdges[stepId] !== undefined) {
      for (const edge of fa.outEdges[stepId]) {
        if (run.steps[edge.endStepId] === undefined) continue;

        if (edge.type === "join") planJoinEdge(edge, run);
        else if (edge.type === "control") {
          if (message.event.data.status === "success") {
            planControlEdge(edge, run, "onSuccess");
          } else if (message.event.data.status === "failure") {
            planControlEdge(edge, run, "onFailure");
          }
        } else if (edge.type === "branch") {
          if (message.event.type === "step.completed") {
            planBranchEdge(edge, run, message.event.data.matchedCase ?? null);
          }
        }
      }
    }
    setRunStatus(run);
  });
};
