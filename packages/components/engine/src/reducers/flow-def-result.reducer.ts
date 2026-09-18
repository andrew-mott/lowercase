import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { FlowDefResultMsg } from "../types/message.types.js";

export const flowDefResultReducer: Reducer<FlowDefResultMsg> = (
  state: EngineState,
  message: FlowDefResultMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.runId;
    const run = draft.runs[runId];

    if (!run) return;
    if (!message.ok) {
      run.status = "failed";
      return;
    }

    draft.flows[run.flowVersionId] ??= {
      definition: message.def,
      runIds: {},
    };
    draft.flows[run.flowVersionId].runIds[runId] = true;
  });
};
