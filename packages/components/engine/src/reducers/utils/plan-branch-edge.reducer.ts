import type { Edge } from "@lcase/types";
import type { RunContext } from "@lcase/types";
import type { WritableDraft } from "immer";

export function planBranchEdge(
  edge: WritableDraft<Edge>,
  run: WritableDraft<RunContext>,
  matchedCase: string | null,
) {
  if (run.steps[edge.endStepId] === undefined) return;
  if (
    edge.type === "branch" &&
    (edge.caseValue === matchedCase ||
      (edge.isDefault === true && matchedCase === null)) &&
    run.steps[edge.endStepId].status === "initialized"
  ) {
    run.steps[edge.endStepId].status = "planned";
    run.outstandingSteps++;
    run.plannedSteps[edge.endStepId] = true;
  }
}
