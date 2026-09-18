import type { Edge } from "@lcase/types";
import type { RunContext } from "@lcase/types";
import type { WritableDraft } from "immer";

export function completeParallelEdge(
  edge: WritableDraft<Edge>,
  run: WritableDraft<RunContext>,
) {
  if (run.steps[edge.startStepId] === undefined) return;
  const parallelStepId = edge.startStepId;
  if (
    edge.type === "parallel" &&
    run.steps[parallelStepId].status === "started"
  ) {
    let allCompleted = true;
    for (const edge of run.flowAnalysis.outEdges[parallelStepId]) {
      if (run.steps[edge.endStepId] === undefined) {
        allCompleted = false;
        continue;
      }
      const status = run.steps[edge.endStepId].status;
      if (
        status !== "started" &&
        status !== "completed" &&
        status !== "planned"
      ) {
        allCompleted = false;
      }
    }

    if (allCompleted) {
      run.steps[parallelStepId].status = "completed";
      run.completedSteps[parallelStepId] = true;
      delete run.startedSteps[parallelStepId];
    }
  }
}
