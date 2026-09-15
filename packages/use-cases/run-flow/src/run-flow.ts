import type { EmitterFactoryPort, RunRequest } from "@lcase/ports";
import { createRunId } from "./create-fork-spec.js";

export type RunDetails = {
  ef: EmitterFactoryPort;
  traceId?: string;
} & RunRequest;
export async function runFlow(runDetails: RunDetails) {
  const {
    runId,
    ef,
    traceId,
    source,
    flowId,
    flowVersionId,
    flowDefHash,
    simId,
    forkSpecHash,
    experimentId,
    targetRunId,
    targetStepId,
    targetExportName,
    params,
  } = runDetails;
  const runid = runId ?? createRunId();
  const spanId = traceId ? ef.generateSpanId() : undefined;
  const emitter = traceId
    ? ef.newRunEmitter({
        source,
        flowid: flowId,
        flowversionid: flowVersionId,
        runid,
        traceId,
        spanId: spanId!,
        traceParent: ef.makeTraceParent(traceId, spanId!),
      })
    : ef.newRunEmitterNewTrace({
        source,
        flowid: flowId,
        flowversionid: flowVersionId,
        runid,
      });
  await emitter.emit("run.requested", {
    flowId,
    flowVersionId,
    flowDefHash,
    ...(simId ? { simId } : {}),
    ...(forkSpecHash ? { forkSpecHash } : {}),
    ...(experimentId ? { experimentId } : {}),
    ...(targetRunId ? { targetRunId } : {}),
    ...(targetStepId ? { targetStepId } : {}),
    ...(targetExportName ? { targetExportName } : {}),
    ...(params ? { params } : {}),
  });
}
