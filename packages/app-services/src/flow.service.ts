import type {
  FlowServicePort,
  ArtifactReadWritePort,
  FlowRepositoryPort,
} from "@lcase/ports";
import type {
  CreateFlowRecordResult,
  FlowDefinition,
  GetFlowsRes,
  GetFlowVersionRes,
  GetFlowVersionsRes,
  Result,
} from "@lcase/types";
import { FlowSchema, parseFlow } from "@lcase/specs";
import { addFlowToCas, readFlowFile } from "@lcase/run-flow";
import { analyzeFlow } from "@lcase/flow-analysis";

export class FlowService implements FlowServicePort {
  constructor(
    private readonly artifacts: ArtifactReadWritePort,
    private readonly flowRepository?: FlowRepositoryPort,
  ) {}

  validateJsonFlow(
    flow: string | Record<string, unknown>,
  ): FlowDefinition | string {
    if (flow === undefined) return "Invalid flow: Undefined";
    try {
      const flowObject = typeof flow === "string" ? JSON.parse(flow) : flow;
      const result = FlowSchema.safeParse(flowObject);
      if (!result.success) {
        return JSON.stringify(result.error, null, 2);
      }

      const fa = analyzeFlow(result.data);
      if (fa.problems.length > 0) {
        return "Flow analysis had problems";
      }
      return result.data;
    } catch (err) {
      return `Invalid flow: Error parsing Json: ${err}"`;
    }
  }

  validateFlow(flow: unknown): Result<FlowDefinition, string> {
    const result = FlowSchema.safeParse(flow);
    if (!result.success) return { ok: false, error: result.error.toString() };

    const fa = analyzeFlow(result.data);
    if (fa.problems.length > 0) {
      return { ok: false, error: "Flow had problems" };
    }

    return { ok: true, value: result.data };
  }

  async storeFlowInCas(path: string) {
    const json = readFlowFile(path);
    const result = parseFlow(json);
    if (result.ok) {
      const hash = await addFlowToCas(result.value, this.artifacts);
      if (hash) console.log(`Flow CAS Hash: ${hash}`);
    } else {
      throw new Error(`Error adding flow to cas: ${result.error}`);
    }
  }

  async getFlowDef(
    flowIdOrHash: string,
  ): Promise<Result<FlowDefinition, string>> {
    if (this.flowRepository) {
      const flowResult = await this.flowRepository.getFlow(flowIdOrHash);
      if (flowResult.ok) {
        const versions =
          await this.flowRepository.listFlowVersions(flowIdOrHash);
        const latestVersion = versions.at(-1);
        if (!latestVersion) {
          return {
            ok: false,
            error: `No flow versions found for flow: ${flowIdOrHash}`,
          };
        }
        return this.getFlowDefByHash(latestVersion.definitionHash);
      }
    }

    return this.getFlowDefByHash(flowIdOrHash);
  }

  private async getFlowDefByHash(
    hash: string,
  ): Promise<Result<FlowDefinition, string>> {
    const result = await this.artifacts.load(hash, "application/json");
    if (!result.ok) return { ok: result.ok, error: result.error.message };

    const validateResult = this.validateFlow(result.value);
    return validateResult;
  }

  async addFlow(
    flow: string | Record<string, unknown>,
  ): Promise<Result<CreateFlowRecordResult, string>> {
    if (!this.flowRepository) {
      return { ok: false, error: "Flow repository not configured" };
    }

    const validateResult = this.validateJsonFlow(flow);
    if (typeof validateResult === "string") {
      return { ok: false, error: validateResult };
    }

    const hash = await addFlowToCas(validateResult, this.artifacts);
    if (!hash) return { ok: false, error: "Error adding flow to CAS" };

    return this.flowRepository.createFlow({
      name: validateResult.name,
      description: validateResult.description,
      kind: validateResult.kind,
      definitionHash: hash,
      versionLabel: validateResult.version,
      versionDescription: validateResult.description,
    });
  }

  async getAllFlows(): Promise<GetFlowsRes> {
    if (!this.flowRepository) {
      return { ok: false, error: "Flow repository not configured" };
    }

    const flows = await this.flowRepository.listFlowsWithLatestVersion();
    return { ok: true, value: flows };
  }

  async getFlowVersions(flowId: string): Promise<GetFlowVersionsRes> {
    if (!this.flowRepository) {
      return { ok: false, error: "Flow repository not configured" };
    }

    const flowResult = await this.flowRepository.getFlow(flowId);
    if (!flowResult.ok) return flowResult;

    const versions = await this.flowRepository.listFlowVersions(flowId);
    return { ok: true, value: versions };
  }

  async getFlowVersionDef(flowVersionId: string): Promise<GetFlowVersionRes> {
    if (!this.flowRepository) {
      return { ok: false, error: "Flow repository not configured" };
    }

    const versionResult =
      await this.flowRepository.getFlowVersion(flowVersionId);
    if (!versionResult.ok) return versionResult;

    const definitionResult = await this.getFlowDefByHash(
      versionResult.value.definitionHash,
    );
    if (!definitionResult.ok) return definitionResult;

    return {
      ok: true,
      value: {
        version: versionResult.value,
        definition: definitionResult.value,
      },
    };
  }
}
