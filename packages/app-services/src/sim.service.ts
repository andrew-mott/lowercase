import type {
  ArtifactReadWritePort,
  EmitterFactoryPort,
  FlowRepositoryPort,
  RunQueryPort,
  SimRepositoryPort,
  SimServicePort,
} from "@lcase/ports";
import type {
  CreateSimRecordInput,
  ForkSpec,
  Result,
  SimDefinition,
  SimListItem,
  SimRecord,
} from "@lcase/types";
import { startForkedSim } from "@lcase/run-flow";

export class SimService implements SimServicePort {
  constructor(
    private readonly artifacts: ArtifactReadWritePort,
    private readonly ef: EmitterFactoryPort,
    private readonly runQuery: RunQueryPort,
    private readonly simRepository: SimRepositoryPort,
    private readonly flowRepository: FlowRepositoryPort,
  ) {}

  async startForkedRunSim(
    parentRunId: string,
    reuseSteps: string[],
    source: string,
  ) {
    const parentRun = await this.runQuery.getRunDetail(parentRunId);
    if (!parentRun.ok) {
      console.log("error getting parent run detail from sql");
      return;
    }

    const { run } = parentRun.value;
    if (!run.flowId || !run.flowVersionId) {
      console.log("error getting relational flow metadata from parent run");
      return;
    }
    await startForkedSim(
      {
        flowId: run.flowId,
        flowVersionId: run.flowVersionId,
        flowDefHash: run.flowDefHash,
      },
      parentRunId,
      reuseSteps,
      source,
      {
        ef: this.ef,
        writer: this.artifacts,
      },
    );
  }

  async getAllSims(): Promise<SimListItem[]> {
    return this.simRepository.listSimsWithFlowVersion();
  }

  async getSimsByFlowVersionId(flowVersionId: string): Promise<SimListItem[]> {
    return this.simRepository.listSimsByFlowVersionId(flowVersionId);
  }

  async getSim(simId: string): Promise<Result<SimDefinition, string>> {
    const simResult = await this.simRepository.getSim(simId);
    if (!simResult.ok) return simResult;

    const specResult = await this.artifacts.load(
      simResult.value.forkSpecHash,
      "application/json",
    );
    if (!specResult.ok) {
      return { ok: false, error: specResult.error.message };
    }

    return {
      ok: true,
      value: {
        sim: simResult.value,
        spec: specResult.value as ForkSpec,
      },
    };
  }

  async saveSim(
    details: Omit<CreateSimRecordInput, "forkSpecHash"> & {
      forkSpec: ForkSpec;
    },
  ): Promise<Result<SimRecord, string>> {
    const versionResult = await this.flowRepository.getFlowVersion(
      details.flowVersionId,
    );
    if (!versionResult.ok) return versionResult;
    if (versionResult.value.flowId !== details.flowId) {
      return {
        ok: false,
        error: "Flow version does not belong to the supplied flow",
      };
    }

    const result = await this.artifacts.save(
      details.forkSpec,
      "application/json",
    );
    if (result.status === "failed") {
      return { ok: false, error: result.error.message };
    }

    return this.simRepository.createSim({
      name: details.name,
      forkSpecHash: result.hash,
      flowId: details.flowId,
      flowVersionId: details.flowVersionId,
      description: details.description,
    });
  }
}
