import type {
  ArtifactRepositoryPort,
  ArtifactReaderPort,
  EmitterFactoryPort,
  RunRequest,
  RunRepositoryPort,
  RunQueryPort,
  RunServicePort,
  RunSettledWaiterPort,
  RunWaitResult,
} from "@lcase/ports";
import {
  analyzeFlow,
  analyzeRefs,
  inferFormatFromContentType,
  isArtifactCompatible,
  resolveFlowOutputs,
} from "@lcase/flow-analysis";
import { createRunId, runFlow } from "@lcase/run-flow";
import type {
  ArtifactIndex,
  FlowAnalysis,
  FlowDefinition,
  JsonValue,
  Result,
  RunDetail,
  RunListItem,
  RunOutputEntry,
  RunOutputs,
  RunParamManifest,
  StepDefinition,
} from "@lcase/types";
import { parseFlow } from "@lcase/specs";

// `mcp` lost its worker executor when packages/tools was deleted
// (docs/todo.md).
const STEP_TYPES_WITHOUT_EXECUTOR: ReadonlySet<StepDefinition["type"]> =
  new Set(["mcp"]);

// The largest json or text output a run's outputs response carries inline.
// Anything bigger, and every binary output, is fetched by its hash instead, so
// the response stays a predictable size.
const MAX_INLINE_OUTPUT_BYTES = 1024 * 1024;

const isTerminal = (status: string) =>
  status === "completed" || status === "failed";

type RunServiceDeps = {
  artifactRepository: ArtifactRepositoryPort;
  artifacts: ArtifactReaderPort;
  ef: EmitterFactoryPort;
  runRepository: RunRepositoryPort;
  runQuery: RunQueryPort;
  runSettled: RunSettledWaiterPort;
  // runParamsStore: RunParamsIndexStorePort;
};

export class RunService implements RunServicePort {
  private readonly artifactRepository: ArtifactRepositoryPort;
  private readonly artifacts: ArtifactReaderPort;
  private readonly ef: EmitterFactoryPort;
  private readonly runRepository: RunRepositoryPort;
  private readonly runQuery: RunQueryPort;
  private readonly runSettled: RunSettledWaiterPort;
  // private readonly runParamsStore: RunParamsIndexStorePort;

  constructor(deps: RunServiceDeps) {
    this.artifactRepository = deps.artifactRepository;
    this.artifacts = deps.artifacts;
    this.ef = deps.ef;
    this.runRepository = deps.runRepository;
    this.runQuery = deps.runQuery;
    this.runSettled = deps.runSettled;
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

  async waitForRun(
    runId: string,
    options: { timeoutMs: number },
  ): Promise<RunWaitResult> {
    // Register before reading the status: a run that settles between the two
    // would otherwise be missed, because a settle is never remembered.
    const wait = this.runSettled.whenSettled(runId);
    let timer: NodeJS.Timeout | undefined;
    try {
      let detail = await this.runQuery.getRunDetail(runId);
      if (!detail.ok) return { status: "failed", error: detail.error };

      if (!isTerminal(detail.value.run.status)) {
        const timedOut = new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), options.timeoutMs);
        });
        const outcome = await Promise.race([
          wait.promise.then(() => "settled" as const),
          timedOut,
        ]);
        if (outcome === "timeout") return { status: "timeout" };

        detail = await this.runQuery.getRunDetail(runId);
        if (!detail.ok) return { status: "failed", error: detail.error };
      }

      if (detail.value.run.status === "failed") {
        return { status: "failed", error: "Run failed" };
      }
      const outputs = await this.getRunOutputs(runId);
      if (!outputs.ok) return { status: "failed", error: outputs.error };
      return { status: "completed", outputs: outputs.value };
    } finally {
      clearTimeout(timer);
      wait.cancel();
    }
  }

  async getRunOutputs(runId: string): Promise<Result<RunOutputs, string>> {
    const detail = await this.runQuery.getRunDetail(runId);
    if (!detail.ok) return { ok: false, error: detail.error };

    const { run, steps } = detail.value;
    if (run.status === "requested" || run.status === "started") {
      return {
        ok: false,
        error: `Run has not finished (status: ${run.status})`,
      };
    }

    let flow: FlowDefinition;
    try {
      flow = await this.#getFlowDefinition(run.flowDefHash);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const results = resolveFlowOutputs(flow, steps);
    const hashes = [
      ...new Set(
        Object.values(results).flatMap((result) =>
          result.ok ? [result.value.hash] : [],
        ),
      ),
    ];
    const metadata = new Map(
      (hashes.length > 0
        ? await this.artifactRepository.getArtifacts(hashes)
        : []
      ).map((artifact) => [artifact.hash, artifact]),
    );

    const outputs: RunOutputs = {};
    for (const [name, result] of Object.entries(results)) {
      if (!result.ok) {
        outputs[name] = { ok: false, error: result.error.reason };
        continue;
      }
      const hash = result.value.hash;
      const entry = await this.#describeOutput(hash, metadata.get(hash));
      if (!entry.ok) return entry;
      outputs[name] = entry.value;
    }
    return { ok: true, value: outputs };
  }

  /**
   * Content type and size come from the artifact's SQL row when it has them,
   * and from the store otherwise: the store knows every artifact's content
   * type even if its metadata row is missing. A binary or oversized output
   * with a complete row is never loaded, so the bytes stay out of memory.
   */
  async #describeOutput(
    hash: string,
    metadata?: ArtifactIndex,
  ): Promise<Result<RunOutputEntry, string>> {
    const knownType = metadata?.contentType;
    const knownSize = metadata?.size;
    const describe = (
      contentType: string,
      size: number | undefined,
      payload?: JsonValue,
    ): RunOutputEntry => ({
      ok: true,
      hash,
      contentType,
      ...(size !== undefined ? { size } : {}),
      ...(payload !== undefined ? { payload } : {}),
    });

    if (
      knownType !== undefined &&
      knownSize !== undefined &&
      !canInline(knownType, knownSize)
    ) {
      return { ok: true, value: describe(knownType, knownSize) };
    }

    const loaded = await this.artifacts.load(hash);
    if (!loaded.ok) {
      return {
        ok: false,
        error: `Unable to load output artifact ${hash}: ${loaded.error.message}`,
      };
    }

    const contentType = knownType ?? loaded.contentType;
    const size = knownSize ?? storedSize(loaded.value);
    if (
      loaded.value instanceof Uint8Array ||
      !canInline(contentType, size ?? jsonSize(loaded.value))
    ) {
      return { ok: true, value: describe(contentType, size) };
    }
    return { ok: true, value: describe(contentType, size, loaded.value) };
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

    const parsed = parseFlow(result.value);
    if (!parsed.ok) {
      throw new Error("Invalid flow definition");
    }

    return parsed.value;
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
        problem.type === "InvalidBinaryRefPosition" ||
        problem.type === "InvalidFlowOutputPayload" ||
        problem.type === "InvalidFlowOutputTarget",
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

const canInline = (contentType: string, size: number): boolean =>
  inferFormatFromContentType(contentType) !== "bytes" &&
  size <= MAX_INLINE_OUTPUT_BYTES;

// A loaded value's byte length, where it is recoverable. Parsed JSON is not:
// whitespace in the stored bytes is gone.
const storedSize = (value: JsonValue | Uint8Array): number | undefined => {
  if (value instanceof Uint8Array) return value.byteLength;
  if (typeof value === "string") return new TextEncoder().encode(value).length;
  return undefined;
};

const jsonSize = (value: JsonValue): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;
