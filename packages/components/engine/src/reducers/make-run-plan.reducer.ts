import { produce } from "immer";
import type { EngineState, Reducer } from "../engine.types.js";
import type { MakeRunPlanMsg } from "../types/message.types.js";
import { analyzeFlow, analyzeRefs } from "@lcase/flow-analysis";
import type { FlowParamDefinition, StepContext } from "@lcase/types";

export const makeRunPlanReducer: Reducer<MakeRunPlanMsg> = (
  state: EngineState,
  message: MakeRunPlanMsg,
) => {
  return produce(state, (draft) => {
    const runId = message.runId;
    const run = draft.runs[runId];

    if (!run) return;
    const flow = draft.flows[run.flowVersionId];

    if (!flow) return;

    const flowAnalysis = analyzeFlow(flow.definition);
    run.flowAnalysis = flowAnalysis;

    if (flowAnalysis.problems.length !== 0) {
      console.log("1", flowAnalysis.problems);
      run.status = "failed";
      return;
    }

    analyzeRefs(flow.definition, flowAnalysis);

    if (flowAnalysis.problems.length !== 0) {
      console.log("2", flowAnalysis.problems);
      run.status = "failed";
      return;
    }

    const paramValidationError = validateRunParams(
      run.params,
      flow.definition.params,
    );
    if (paramValidationError) {
      run.status = "failed";
      return;
    }

    // try to build run plan inline for now.
    // assumes steps not reused are rerun

    if (run.forkSpec && run.reusableStepData) {
      for (const stepId of run.forkSpec.reuse) {
        const reusableStep = run.reusableStepData[stepId];
        if (!reusableStep) {
          run.status = "failed";
          return;
        }
        run.runPlan.reuse[stepId] = {
          status: reusableStep.status!,
          outputHash: reusableStep.outputHash,
          exportHashes: reusableStep.exportHashes,
        };
      }
    }

    // quickly initialize each step by flow definition
    const initAllStepContexts: Record<string, StepContext> = {};

    for (const step of Object.keys(flow.definition.steps)) {
      const stepContext: StepContext = {
        status: "initialized",
        attempt: 0,
        output: {},
        outputHash: null,
        exportHashes: {},
        resolved: {},
      };

      initAllStepContexts[step] = stepContext;
    }
    run.steps = initAllStepContexts;
    run.status = "started";
  });
};

function validateRunParams(
  params: Record<string, string>,
  declarations?: Record<string, FlowParamDefinition>,
): string | undefined {
  if (!declarations) {
    return Object.keys(params).length > 0
      ? "undeclared params supplied"
      : undefined;
  }

  for (const supplied of Object.keys(params)) {
    if (declarations[supplied] === undefined)
      return `undeclared param:${supplied}`;
  }

  for (const [name, declaration] of Object.entries(declarations)) {
    if (!declaration.optional && params[name] === undefined) {
      return `missing required param:${name}`;
    }
  }
}
