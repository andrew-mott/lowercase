import type { RunContext } from "@lcase/types";
import type { EngineState } from "../../src/engine.types.js";
import { flowDef } from "./flow-definition.js";

export const flowDefResultOkState: EngineState = {
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
  flows: {
    // add flow to flows if its not there,
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true }, // and add run id to it
    },
  },
};

export const flowDefResultOkStateForkSpecHash: EngineState = {
  runs: {
    ["test-runid"]: {
      flowId: "test-flowid",
      flowVersionId: "test-flowversionid",
      flowDefHash: "test-flowdefhash",
      forkSpecHash: "test-forkspechash",

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
    // add flow to flows if its not there,
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true }, // and add run id to it
    },
  },
};

export const flowDefResultNotOkState: EngineState = {
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
      status: "failed", // status changed to failed on ok: false message
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
