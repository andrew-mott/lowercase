import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { ReusableStepDataResultMsg } from "../types/message.types.js";

export const reusableStepDataResultReducer: Reducer<
  ReusableStepDataResultMsg
> = (state: EngineState, message: ReusableStepDataResultMsg) => {
  return produce(state, (draft) => {
    const { runId } = message;
    const run = draft.runs[runId];

    if (!run) return;
    if (!message.ok) {
      run.status = "failed";
      return;
    }

    run.reusableStepData = message.reusableStepData;
  });
};
