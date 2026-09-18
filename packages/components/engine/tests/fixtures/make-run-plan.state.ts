import type { RunContext } from "@lcase/types";
import type { EngineState } from "../../src/engine.types.js";
import { flowDef, flowDefWithProblems } from "./flow-definition.js";
import {
  flowAnalysisB,
  flowAnalysisBWithProblem,
} from "./flow-analysis.state.js";

// changes to state are marked on happy path
export const makeRunPlanNewState: EngineState = {
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
      plannedSteps: {},
      completedSteps: {},
      failedSteps: {},
      outstandingSteps: 0,
      input: {},
      status: "started", // change status to started

      // initialize steps
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
          status: "initialized",
          attempt: 0,
          output: {},
          outputHash: null,
          exportHashes: {},
          resolved: {},
        },
      },

      flowAnalysis: flowAnalysisB, // add completed flow analysis
    } satisfies RunContext,
  },
  flows: {
    "test-flowversionid": {
      definition: flowDef,
      runIds: { "test-runid": true },
    },
  },
};

export const makeRunPlanNewStateFAProblems: EngineState = {
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

      // run plan is empty
      runPlan: {
        reuse: {},
      },
      startedSteps: {},
      plannedSteps: {},
      completedSteps: {},
      failedSteps: {},
      outstandingSteps: 0,
      input: {},
      status: "failed", // change status to failed

      // don't initialize steps when flowAnalysis has problems
      steps: {},

      flowAnalysis: flowAnalysisBWithProblem, // add flow analysis with problems
    } satisfies RunContext,
  },
  flows: {
    "test-flowversionid": {
      definition: flowDefWithProblems,
      runIds: { "test-runid": true },
    },
  },
};
