import { randomUUID } from "crypto";
import type {
  EmitJobMcpSubmittedFx,
  EmitStepStartedFx,
  EngineEffect,
  EngineState,
  Planner,
  PublishJobHttpJsonSubmittedFx,
} from "../engine.types.js";
import type { StepPlannedMsg } from "../types/message.types.js";
import { makeStepRefs } from "../references/value-refs.js";
import type {
  EmitStepReusedFx,
  ResolveBranchValueFx,
} from "../types/effect.types.js";

export const stepPlannedPlanner: Planner<StepPlannedMsg> = (
  oldState: EngineState,
  newState: EngineState,
  message: StepPlannedMsg,
): EngineEffect[] => {
  const effects: EngineEffect[] = [];

  const runId = message.event.runid;
  const stepId = message.event.stepid;
  const stepType = message.event.steptype;

  const newRun = newState.runs[runId];
  if (!newRun) return effects;
  const flow = newState.flows[newRun.flowVersionId];
  if (!flow) return effects;
  const step = flow.definition.steps[stepId];
  if (!step) return effects;

  // emit step.reused instead of step.started if reused by run plan
  if (newRun.runPlan.reuse[stepId]) {
    const status =
      newRun.steps[stepId].status === "completed" ? "success" : "failure";
    const emitStepReused: EmitStepReusedFx = {
      type: "EmitStepReused",
      scope: {
        flowid: newRun.flowId,
        flowversionid: newRun.flowVersionId,
        runid: runId,
        stepid: stepId,
        steptype: stepType,
      },
      data: {
        status,
        outputHash: newRun.steps[stepId].outputHash ?? undefined,
        exportHashes:
          Object.keys(newRun.steps[stepId].exportHashes).length > 0
            ? newRun.steps[stepId].exportHashes
            : undefined,
        sourceRunId: newRun.forkSpec?.parentRunId ?? "",
      },
      traceId: message.event.traceid,
    };
    effects.push(emitStepReused);
    return effects;
  }

  const emitStepStarted: EmitStepStartedFx = {
    type: "EmitStepStarted",
    scope: {
      flowid: newRun.flowId,
      flowversionid: newRun.flowVersionId,
      runid: runId,
      stepid: stepId,
      steptype: stepType,
    },
    data: {
      status: "started",
      step: {
        id: stepId,
        name: stepId,
        type: stepType,
      },
    },
    traceId: newRun.traceId,
  };
  effects.push(emitStepStarted);

  /**
   * no longer materialize steps here, worker resolves json to values using CAS.
   */
  if (stepType === "httpjson" && step.type === "httpjson") {
    const jobRefs = makeStepRefs(
      stepId,
      newRun.flowAnalysis.refs,
      newRun.steps,
      newRun.params,
      flow.definition.params,
      flow.definition.steps,
    );
    const exportRefs = newRun.flowAnalysis.exportRefsByStep?.[stepId] ?? {};

    // One canonical envelope per submission: one jobid, one copy of the job
    // data, one effect. Publishing the submitted Message *is* the dispatch, so
    // there is no second object that could drift into a different identity.
    const jobId = "job-" + randomUUID();
    const jobScope = {
      flowid: newRun.flowId,
      flowversionid: newRun.flowVersionId,
      runid: runId,
      stepid: stepId,
      jobid: jobId,
      capid: "httpjson" as const,
      toolid: "httpjson",
    };
    const jobData = {
      url: step.url,
      ...(step.body ? { body: step.body } : {}),
      ...(step.headers ? { headers: step.headers } : {}),
      ...(step.method ? { method: step.method } : {}),
      ...(step.args ? { args: step.args } : {}),
      refs: jobRefs,
      ...(Object.keys(exportRefs).length > 0 ? { exportRefs } : {}),
    };

    const publishJob: PublishJobHttpJsonSubmittedFx = {
      type: "PublishJobHttpJsonSubmitted",
      scope: jobScope,
      data: jobData,
      traceId: newRun.traceId,
    };
    effects.push(publishJob);
  } else if (stepType === "mcp" && step.type === "mcp") {
    // const materializedStep = bindStepRefs(
    //   refs,
    //   newRun.steps[stepId].resolved,
    //   step as StepMcp
    // );
    const jobRefs = makeStepRefs(
      stepId,
      newRun.flowAnalysis.refs,
      newRun.steps,
      newRun.params,
      flow.definition.params,
      flow.definition.steps,
    );
    const emitJob: EmitJobMcpSubmittedFx = {
      type: "EmitJobMcpSubmitted",
      scope: {
        flowid: newRun.flowId,
        flowversionid: newRun.flowVersionId,
        capid: "mcp",
        runid: runId,
        stepid: stepId,
        toolid: "mcp",
      },
      data: {
        url: step.url,
        feature: step.feature,
        transport: step.transport,
        ...(step.args ? { args: step.args } : {}),
        refs: jobRefs,
      },
      traceId: newRun.traceId,
    };
    effects.push(emitJob);
  } else if (stepType === "branch" && step.type === "branch") {
    const jobRefs = makeStepRefs(
      stepId,
      newRun.flowAnalysis.refs,
      newRun.steps,
      newRun.params,
      flow.definition.params,
      flow.definition.steps,
    );
    const valueRef = jobRefs.find((ref) => ref.bindPath[0] === "value");
    if (valueRef) {
      const resolveBranchValue: ResolveBranchValueFx = {
        type: "ResolveBranchValue",
        runId,
        stepId,
        ref: valueRef,
        cases: step.cases,
      };
      effects.push(resolveBranchValue);
    }
  }

  return effects;
};
