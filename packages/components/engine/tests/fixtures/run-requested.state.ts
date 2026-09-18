import type { RunContext } from "@lcase/types";
import type { EngineState } from "../../src/engine.types.js";

export const runRequestedOldState: EngineState = {
  runs: {},
  flows: {},
};

export const runRequestedNewState: EngineState = {
  runs: {
    ["test-runid"]: {
      flowId: "test-flowid",
      flowVersionId: "test-flowversionid",
      flowDefHash: "test-flowdefhash",

      runId: "test-runid",
      traceId: "test-traceid",
      params: {},
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
    } satisfies RunContext,
  },
  flows: {},
};
