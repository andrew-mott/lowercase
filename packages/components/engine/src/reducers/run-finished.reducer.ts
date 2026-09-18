import { produce } from "immer";
import type { EngineState, Reducer, RunFinishedMsg } from "../engine.types.js";

export const runFinishedReducer: Reducer<RunFinishedMsg> = (
  state: EngineState,
  message: RunFinishedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const run = draft.runs[runId];
    if (!run) return;
  });
};
