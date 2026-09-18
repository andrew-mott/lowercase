import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { ForkSpecResultMsg } from "../types/message.types.js";

export const forkSpecResultReducer: Reducer<ForkSpecResultMsg> = (
  state: EngineState,
  message: ForkSpecResultMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.runId;

    const run = draft.runs[runId];

    if (!run) return;

    if (!message.ok) {
      run.status = "failed";
      return;
    }
    run.forkSpec = message.forkSpec;
  });
};
