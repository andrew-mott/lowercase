import type { RunContext } from "@lcase/types";
import type { EngineState } from "../../src/engine.types.js";
import { flowAnalysisB } from "./flow-analysis.state.js";
import { flowDef } from "./flow-definition.js";

export const runStartedNewState: EngineState = {
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

      // create run plan
      runPlan: {
        reuse: {
          b: {
            status: "success",
            outputHash: "test-outputhash",
          },
        },
      },
      startedSteps: {},
      plannedSteps: { parallel: true }, // add step to object for set like lookup
      completedSteps: {},
      failedSteps: {},
      outstandingSteps: 1, // incremented as planned is considered outstanding
      input: {},
      status: "started",

      steps: {
        b: {
          status: "initialized",
          attempt: 0,
          output: {},
          outputHash: null,
          exportHashes: {},
          resolved: {},
        },
        parallel: {
          status: "planned", // change to planned
          attempt: 0,
          output: {},
          outputHash: null,
          exportHashes: {},
          resolved: {},
        },
      },

      flowAnalysis: flowAnalysisB,
    } satisfies RunContext,
  },
  flows: {
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true },
    },
  },
};
