import type {
  ArtifactIndex,
  ArtifactListFilter,
  ArtifactListItem,
  ArtifactUpdateMetadata,
  ArtifactPutInput,
  AnyEvent,
  CreateSimRecordInput,
  GetFlowsRes,
  GetFlowVersionRes,
  GetFlowVersionsRes,
  FlowDefinition,
  CreateFlowRecordResult,
  EvalResultRecord,
  ForkSpec,
  JsonValue,
  Result,
  RunDetail,
  RunListItem,
  RunParamManifest,
  SimDefinition,
  SimListItem,
  SimRecord,
} from "@lcase/types";
import type { ArtifactLoadError } from "../artifacts/artifact-reader.port.js";

// Relocated from the now-deleted artifacts.port.ts (legacy ArtifactsPort) --
// ArtifactServicePort.getArtifact is its only remaining consumer. Error
// branch now reuses ArtifactReaderPort's ArtifactLoadError instead of the
// old bespoke GetError, which had no other consumer left once ArtifactsPort
// was retired. See docs/todo.md for the deferred ArtifactIndex/error-type
// direction this is a small preview of.
export type AutoGetResult =
  | { ok: true; format: "json"; value: JsonValue }
  | { ok: true; format: "text" | "markdown"; value: string }
  | { ok: true; format: "bytes"; value: Uint8Array }
  | { ok: false; error: ArtifactLoadError };

export interface ServicesPort {
  flow: FlowServicePort;
  sim: SimServicePort;
  replay: ReplayServicePort;
  run: RunServicePort;
  artifact: ArtifactServicePort;
  eval: EvalServicePort;
}

export interface SimServicePort {
  startForkedRunSim(
    parentRunId: string,
    reuseSteps: string[],
    source: string,
  ): Promise<void>;

  getAllSims(): Promise<SimListItem[]>;
  getSimsByFlowVersionId(flowVersionId: string): Promise<SimListItem[]>;
  getSim(simId: string): Promise<Result<SimDefinition, string>>;
  saveSim(
    simDetails: Omit<CreateSimRecordInput, "forkSpecHash"> & {
      forkSpec: ForkSpec;
    },
  ): Promise<Result<SimRecord, string>>;
}

export interface FlowServicePort {
  validateJsonFlow(
    flow: string | Record<string, unknown>,
  ): FlowDefinition | string;
  storeFlowInCas(path: string): Promise<void>;
  addFlow(
    flow: string | FlowDefinition,
  ): Promise<Result<CreateFlowRecordResult, string>>;
  getAllFlows(): Promise<GetFlowsRes>;
  getFlowVersions(flowId: string): Promise<GetFlowVersionsRes>;
  getFlowVersionDef(flowVersionId: string): Promise<GetFlowVersionRes>;
  getFlowDef(flowIdOrHash: string): Promise<Result<FlowDefinition, string>>;
}
export interface ReplayServicePort {
  replayRun(runId: string): Promise<void>;
  getAllEvents(runId: string): Promise<{
    events: AnyEvent[];
  }>;
}

export type RunRequest = {
  flowId: string;
  flowVersionId: string;
  flowDefHash: string;
  source: string;
  runId?: string;
  simId?: string;
  forkSpecHash?: string;
  experimentId?: string;
  targetRunId?: string;
  targetStepId?: string;
  targetExportName?: string;
  params?: Record<string, string>;
};
export interface RunServicePort {
  requestRun(request: RunRequest): Promise<void>;
  makeRunId(): string;
  listAllRuns(): Promise<RunListItem[]>;
  listRunsByFlowVersionId(flowVersionId: string): Promise<RunListItem[]>;
  getRunDetail(runId: string): Promise<Result<RunDetail, string>>;
  getRunParams(runId: string): Promise<Result<RunParamManifest, string>>;
  // getRunParamsIndex(runId: string): Promise<Result<RunParams, string>>;
}

export type EvalTargetRef = {
  runId: string;
  stepId: string;
  exportName: string;
  paramName: string;
};

export type StartEvalRunRequest = {
  targets: EvalTargetRef[];
  evalFlowId: string;
  evalFlowVersionId: string;
  evalFlowDefHash: string;
  judgeSystemPromptHash: string;
  experimentId?: string;
  source: string;
};

export interface EvalServicePort {
  startEvalRun(
    request: StartEvalRunRequest,
  ): Promise<Result<{ evalRunId: string }, string>>;
  listByTargetShape(shape: {
    flowId: string;
    stepId: string;
    exportName: string;
  }): Promise<EvalResultRecord[]>;
  listByExperimentId(experimentId: string): Promise<EvalResultRecord[]>;
}

export interface ArtifactServicePort {
  getArtifact(hash: string): Promise<AutoGetResult>;
  listArtifacts(filter?: ArtifactListFilter): Promise<ArtifactListItem[]>;
  createArtifact(
    input: ArtifactPutInput,
    metadata?: ArtifactUpdateMetadata,
  ): Promise<Result<ArtifactIndex, string>>;
  updateArtifactMetadata(
    hash: string,
    metadata: ArtifactUpdateMetadata,
  ): Promise<Result<ArtifactIndex, string>>;
  listCuratedArtifacts(
    flowVersionId: string,
    paramName: string,
  ): Promise<ArtifactIndex[]>;
}
