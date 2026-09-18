import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { RunRequestedMsg } from "../types/message.types.js";
import type { RunContext } from "@lcase/types";

export const runRequestedReducer: Reducer<RunRequestedMsg> = (
  state: EngineState,
  message: RunRequestedMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.event.runid;
    const flowId = message.event.flowid;
    const flowVersionId = message.event.flowversionid;
    const traceId = message.event.traceid;
    const flowDefHash = message.event.data.flowDefHash;
    const forkSpecHash = message.event.data.forkSpecHash;
    const params = message.event.data.params ?? {};

    if (draft.runs[runId] !== undefined) return; // run id already exists

    const runCtx = {
      flowId,
      flowVersionId,
      flowDefHash,
      ...(forkSpecHash ? { forkSpecHash } : {}),
      runId,
      traceId,
      params,
      runPlan: {
        reuse: {},
      },
      startedSteps: {},
      plannedSteps: {},
      completedSteps: {},
      failedSteps: {},
      outstandingSteps: 0,
      input: {},
      status: "requested",
      steps: {},
      flowAnalysis: {
        nodes: [],
        inEdges: {},
        outEdges: {},
        joinDeps: {},
        problems: [],
        refs: [],
        exportRefsByStep: {},
      },
    } satisfies RunContext;
    draft.runs[runId] = runCtx;
  });
};
