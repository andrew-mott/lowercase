import type {
  ArtifactRepositoryPort,
  ArtifactReaderPort,
  EmitterFactoryPort,
  RunRequest,
  RunRepositoryPort,
  RunQueryPort,
  RunServicePort,
} from "@lcase/ports";
import {
  analyzeFlow,
  analyzeRefs,
  isArtifactCompatible,
} from "@lcase/flow-analysis";
import { createRunId, runFlow } from "@lcase/run-flow";
import type {
  FlowAnalysis,
  FlowDefinition,
  Result,
  RunDetail,
  RunListItem,
  RunParamManifest,
  StepDefinition,
} from "@lcase/types";
import { FlowSchema } from "@lcase/specs";

// `http` is not dispatched by the engine yet, and `mcp` lost its worker executor
// when packages/tools was deleted (docs/todo.md).
const STEP_TYPES_WITHOUT_EXECUTOR: ReadonlySet<StepDefinition["type"]> =
  new Set(["http", "mcp"]);

type RunServiceDeps = {
  artifactRepository: ArtifactRepositoryPort;
  artifacts: ArtifactReaderPort;
  ef: EmitterFactoryPort;
  runRepository: RunRepositoryPort;
  runQuery: RunQueryPort;
  // runParamsStore: RunParamsIndexStorePort;
};

export class RunService implements RunServicePort {
  private readonly artifactRepository: ArtifactRepositoryPort;
  private readonly artifacts: ArtifactReaderPort;
  private readonly ef: EmitterFactoryPort;
  private readonly runRepository: RunRepositoryPort;
  private readonly runQuery: RunQueryPort;
  // private readonly runParamsStore: RunParamsIndexStorePort;

  constructor(deps: RunServiceDeps) {
    this.artifactRepository = deps.artifactRepository;
    this.artifacts = deps.artifacts;
    this.ef = deps.ef;
    this.runRepository = deps.runRepository;
    this.runQuery = deps.runQuery;
    // this.runParamsStore = deps.runParamsStore;
  }

  async requestRun(request: RunRequest) {
    await this.#validateRunRequest(request);

    const runId = request.runId ?? createRunId();
    const traceId = this.ef.generateTraceId();
    const result = await this.runRepository.createRun({
      id: runId,
      traceId,
      status: "requested",
      source: request.source,
      flowId: request.flowId,
      flowVersionId: request.flowVersionId,
      flowDefHash: request.flowDefHash,
      simId: request.simId,
      forkSpecHash: request.forkSpecHash,
      experimentId: request.experimentId,
      targetRunId: request.targetRunId,
      targetStepId: request.targetStepId,
      targetExportName: request.targetExportName,
      params: request.params,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }

    await runFlow({
      ...request,
      runId,
      traceId,
      ef: this.ef,
    });
  }

  makeRunId() {
    return createRunId();
  }

  async listAllRuns(): Promise<RunListItem[]> {
    return this.runQuery.listRuns();
  }

  async listRunsByFlowVersionId(flowVersionId: string): Promise<RunListItem[]> {
    return this.runQuery.listByFlowVersionId(flowVersionId);
  }

  async getRunDetail(runId: string): Promise<Result<RunDetail, string>> {
    return this.runQuery.getRunDetail(runId);
  }

  async getRunParams(runId: string): Promise<Result<RunParamManifest, string>> {
    const detail = await this.runQuery.getRunDetail(runId);
    if (!detail.ok) return { ok: false, error: detail.error };

    const params = detail.value.params;
    if (!params || params.length === 0) return { ok: true, value: {} };

    return {
      ok: true,
      value: Object.fromEntries(
        params.map((param) => [param.name, param.artifactHash]),
      ),
    };
  }

  async #validateRunRequest(request: RunRequest): Promise<void> {
    const flow = await this.#getFlowDefinition(request.flowDefHash);
    this.#validateStepsExecutable(flow);
    const analysis = analyzeFlow(flow);
    analyzeRefs(flow, analysis);

    this.#validateStringParamRefs(flow, analysis);
    this.#validateRefProblems(analysis);

    if (!request.params || Object.keys(request.params).length === 0) return;

    for (const [paramName, artifactHash] of Object.entries(request.params)) {
      const declaration = flow.params?.[paramName];
      if (!declaration) {
        throw new Error(`Undeclared run param: ${paramName}`);
      }

      const artifact = await this.artifactRepository.getArtifact(artifactHash);
      if (!artifact) {
        throw new Error(`Run param artifact not found: ${artifactHash}`);
      }

      if (!isArtifactCompatible(artifact.contentType, declaration.type)) {
        throw new Error(
          `Run param ${paramName} requires ${declaration.type}, received ${artifact.contentType ?? artifact.format ?? "unknown"}`,
        );
      }
    }
  }

  async #getFlowDefinition(flowDefHash: string): Promise<FlowDefinition> {
    const result = await this.artifacts.load(flowDefHash, "application/json");
    if (!result.ok) {
      throw new Error(
        `Unable to load flow definition: ${result.error.message}`,
      );
    }

    const parsed = FlowSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new Error("Invalid flow definition");
    }

    return parsed.data;
  }

  /**
   * Refuses a flow with a step type that parses but that nothing executes, so
   * the caller learns before a run exists instead of watching one wait forever:
   * the engine would dispatch the step and no worker would ever answer.
   */
  #validateStepsExecutable(flow: FlowDefinition): void {
    const unexecutable = Object.entries(flow.steps)
      .filter(([, step]) => STEP_TYPES_WITHOUT_EXECUTOR.has(step.type))
      .map(([stepId, step]) => `${stepId} (${step.type})`);
    if (unexecutable.length > 0) {
      throw new Error(
        `Flow has steps that cannot run yet: ${unexecutable.join(", ")}`,
      );
    }
  }

  #validateStringParamRefs(flow: FlowDefinition, analysis: FlowAnalysis): void {
    for (const ref of analysis.refs) {
      if (ref.scope !== "params") continue;
      const paramName = ref.valuePath[1];
      if (typeof paramName !== "string") continue;

      const declaration = flow.params?.[paramName];
      if (!declaration || declaration.type === "application/json") continue;
      if (ref.valuePath.length > 2) {
        throw new Error(
          `String-backed run param refs must target the whole value: ${ref.string}`,
        );
      }
    }
  }

  #validateRefProblems(analysis: FlowAnalysis): void {
    const problems = analysis.problems.filter(
      (problem) =>
        problem.type === "InvalidExportRef" ||
        problem.type === "InvalidExportRefPath" ||
        problem.type === "InvalidBinaryRefPosition",
    );
    if (problems.length > 0) {
      throw new Error(`Invalid step reference(s): ${JSON.stringify(problems)}`);
    }
  }

  // async getRunParamsIndex(runId: string): Promise<Result<RunParams, string>> {
  //   const runParams = await this.runParamsStore.getRunParams(runId);
  //   if (!runParams) return { ok: false, error: "Error getting run params" };
  //   return { ok: true, value: runParams };
  // }
}
