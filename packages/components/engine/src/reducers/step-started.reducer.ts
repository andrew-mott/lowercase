import { produce } from "immer";
import type { StepStartedMsg } from "../types/message.types.js";
import type { EngineState, Reducer } from "../engine.types.js";
import { completeParallelEdge } from "./utils/complete-parallel-edge.reducer.js";

export const stepStartedReducer: Reducer<StepStartedMsg> = (
  state: EngineState,
  message: StepStartedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const stepId = message.event.stepid;
    const stepType = message.event.steptype;

    const run = draft.runs[runId];
    const fa = run.flowAnalysis;

    if (!run) return;

    if (stepType === "parallel") {
      for (const edge of fa.outEdges[stepId]) {
        if (run.steps[edge.endStepId].status === "initialized") {
          run.steps[edge.endStepId].status = "planned";
          run.plannedSteps[edge.endStepId] = true;
          run.outstandingSteps++;
        }
      }
    } else if (stepType === "join") {
      // A join step starts no downstream work here -- its readiness is
      // decided by plan-join-edge as each inbound edge completes.
    } else {
      if (fa.inEdges[stepId] !== undefined) {
        for (const edge of fa.inEdges[stepId]) {
          if (edge.type === "parallel") completeParallelEdge(edge, run);
        }
      }
    }
  });
};
