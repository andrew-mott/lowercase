import type { RunContext } from "@lcase/types";
import type { EngineState } from "../../src/engine.types.js";
import { flowDef } from "./flow-definition.js";

export const reusableStepDataResultOkState: EngineState = {
  runs: {
    ["test-runid"]: {
      flowId: "test-flowid",
      flowVersionId: "test-flowversionid",
      flowDefHash: "test-flowdefhash",
      forkSpecHash: "test-forkspechash",
      forkSpec: {
        parentRunId: "test-parentrunid",
        reuse: ["b"],
      },
      reusableStepData: {
        b: {
          stepId: "b",
          outputHash: "test-outputhash",
          status: "success",
        },
      },

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
  flows: {
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true },
    },
  },
};

export const reusableStepDataResultNotOkState: EngineState = {
  runs: {
    ["test-runid"]: {
      flowId: "test-flowid",
      flowVersionId: "test-flowversionid",
      flowDefHash: "test-flowdefhash",
      forkSpecHash: "test-forkspechash",
      forkSpec: {
        parentRunId: "test-parentrunid",
        reuse: ["b"],
      },
      // reusableStepData - missing lookup result

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
      status: "failed", // status set to failed
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
  flows: {
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true },
    },
  },
};
