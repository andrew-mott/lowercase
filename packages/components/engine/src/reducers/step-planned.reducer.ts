import { produce } from "immer";
import type { StepPlannedMsg } from "../types/message.types.js";
import type { EngineState, Reducer } from "../engine.types.js";
import { resolvePath } from "@lcase/json-ref-binder";

export const stepPlannedReducer: Reducer<StepPlannedMsg> = (
  state: EngineState,
  message: StepPlannedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const stepId = message.event.stepid;

    const run = draft.runs[runId];
    const flow = run ? draft.flows[run.flowVersionId] : undefined;

    if (!run) return;
    if (!flow) return;
    const stepDef = flow.definition.steps[stepId];
    const stepContext = run.steps[stepId];

    if (!stepDef) return;
    if (!stepContext) return;

    if (stepContext.status !== "planned") return;
    if (!run.plannedSteps[stepId]) return;

    if (run.runPlan.reuse[stepId]) {
      stepContext.status =
        run.runPlan.reuse[stepId].status === "success" ? "completed" : "failed";
      delete run.plannedSteps[stepId];
      stepContext.outputHash = run.runPlan.reuse[stepId].outputHash ?? null;
      stepContext.exportHashes = run.runPlan.reuse[stepId].exportHashes ?? {};
      return;
    }

    stepContext.status = "started";
    delete run.plannedSteps[stepId];
    run.startedSteps[stepId] = true;

    const refs = run.flowAnalysis.refs.filter((ref) => ref.stepId === stepId);
    if (!refs.length) return;

    for (const ref of refs) {
      const value = resolvePath(ref.valuePath, {
        steps: run.steps,
        params: run.params,
        input: run.input,
      });
      run.steps[stepId].resolved[ref.string] = value;
    }
  });
};
