import type { ForkSpec } from "@lcase/types";
import type { ArtifactWriterPort, EmitterFactoryPort } from "@lcase/ports";
import { randomUUID } from "node:crypto";

export function createForkSpec(steps: string[], runId: string) {
  const forkSpec: ForkSpec = {
    parentRunId: runId,
    reuse: steps,
  };
  return forkSpec;
}

type RunForkedSimDeps = {
  ef: EmitterFactoryPort;
  writer: ArtifactWriterPort;
};

type ForkedRunFlowMeta = {
  flowId: string;
  flowVersionId: string;
  flowDefHash: string;
};
export async function startForkedSim(
  flow: ForkedRunFlowMeta,
  parentRunId: string,
  reuseSteps: string[],
  source: string,
  deps: RunForkedSimDeps,
) {
  const forkSpec = createForkSpec(reuseSteps, parentRunId);
  const runId = createRunId();

  const emitter = deps.ef.newRunEmitterNewTrace({
    source,
    flowid: flow.flowId,
    flowversionid: flow.flowVersionId,
    runid: runId,
  });

  const forkSpecResult = await deps.writer.save(forkSpec, "application/json");
  if (forkSpecResult.status === "failed") {
    console.log("Error storing fork spec");
    console.log(forkSpecResult.error);
    return;
  }

  await emitter.emit("run.requested", {
    flowId: flow.flowId,
    flowVersionId: flow.flowVersionId,
    flowDefHash: flow.flowDefHash,
    forkSpecHash: forkSpecResult.hash,
  });
}

export function createRunId(): string {
  const uuid = randomUUID();
  return `run-${uuid}`;
}
