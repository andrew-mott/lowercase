import type { Edge } from "@lcase/types";
import type { RunContext } from "@lcase/types";
import type { WritableDraft } from "immer";

export function planControlEdge(
  edge: WritableDraft<Edge>,
  run: WritableDraft<RunContext>,
  gate: "onSuccess" | "onFailure",
) {
  if (run.steps[edge.endStepId] === undefined) return;
  if (
    edge.type === "control" &&
    (edge.gate === "always" || edge.gate === gate) &&
    run.steps[edge.endStepId].status === "initialized"
  ) {
    run.steps[edge.endStepId].status = "planned";
    run.outstandingSteps++;
    run.plannedSteps[edge.endStepId] = true;
  }
}
