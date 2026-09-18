import { produce } from "immer";
import type { EngineState, Reducer, RunStartedMsg } from "../engine.types.js";

/**
 * Invoked after a `run.started` event is received, generally after
 * a `flow.submitted` event is received and processed.
 *
 * Looks at the start step for the floor and moves it to pending state
 * @param state EngineState
 * @param message RunStartedMsg
 * @returns EngineState
 */
export const runStartedReducer: Reducer<RunStartedMsg> = (
  state: EngineState,
  message: RunStartedMsg,
): EngineState => {
  return produce(state, (draft) => {
    const runId = message.event.runid;

    const run = draft.runs[runId];
    const flow = run ? draft.flows[run.flowVersionId] : undefined;

    if (!run) return;
    if (!flow) return;

    const def = flow.definition;
    const stepId = def.start;
    const step = run.steps[stepId];
    if (!step) return;

    step.status = "planned";
    run.plannedSteps[stepId] = true;
    run.outstandingSteps++;
  });
};
