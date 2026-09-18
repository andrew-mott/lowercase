import type { Edge } from "@lcase/types";
import type { RunContext } from "@lcase/types";
import type { WritableDraft } from "immer";
import { planControlEdge } from "./plan-control-edge.reducer.js";

export function planJoinEdge(
  edge: WritableDraft<Edge>,
  run: WritableDraft<RunContext>,
) {
  if (edge.type !== "join") return;
  // if they all succeeded, succeed/complete join
  // if all either completed or failed, but not succeeded, fail join
  let allCompleted = true;
  let allFinished = true;
  const fa = run.flowAnalysis;
  for (const stepId of fa.joinDeps[edge.endStepId]) {
    const step = run.steps[stepId];
    if (!step) {
      allCompleted = false;
      allFinished = false;
      break;
    }
    if (step.status !== "completed") allCompleted = false;
    if (step.status !== "completed" && step.status !== "failed") {
      allFinished = false;
    }
  }
  if (allCompleted) {
    run.steps[edge.endStepId].status = "completed";
    run.completedSteps[edge.endStepId] = true;

    if (!fa.outEdges[edge.endStepId]) return;
    const joinOutEdge = fa.outEdges[edge.endStepId][0];

    planControlEdge(joinOutEdge, run, "onSuccess");
  } else if (allFinished === true) {
    run.steps[edge.endStepId].status = "failed";
    run.failedSteps[edge.endStepId] = true;
  }
}
