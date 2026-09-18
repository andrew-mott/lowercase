import type {
  ArtifactReaderPort,
  EvalResultRepositoryPort,
  EvalServicePort,
  RunQueryPort,
  RunRepositoryPort,
  RunServicePort,
  StartEvalRunRequest,
} from "@lcase/ports";
import type {
  EvalContextSource,
  EvalResultRecord,
  Result,
  RunDetail,
} from "@lcase/types";
import { FlowSchema } from "@lcase/specs";

type EvalServiceDeps = {
  runService: RunServicePort;
  runQuery: RunQueryPort;
  runRepository: RunRepositoryPort;
  artifacts: ArtifactReaderPort;
  evalResults: EvalResultRepositoryPort;
};

function resolveContextSource(
  source: EvalContextSource,
  detail: RunDetail,
): string | undefined {
  if (source.source === "param") {
    return detail.params?.find((p) => p.name === source.name)?.artifactHash;
  }
  const step = detail.steps.find((s) => s.stepId === source.stepId);
  if (source.source === "output") {
    return step?.outputHash;
  }
  return step?.exports?.find((e) => e.name === source.name)?.artifactHash;
}

export class EvalService implements EvalServicePort {
  constructor(private readonly deps: EvalServiceDeps) {}

  async startEvalRun(
    request: StartEvalRunRequest,
  ): Promise<Result<{ evalRunId: string }, string>> {
    if (request.targets.length === 0) {
      return { ok: false, error: "startEvalRun requires at least one target" };
    }
    if (request.targets.length > 1) {
      return {
        ok: false,
        error:
          "Multi-target eval storage not yet supported: Run/EvalResult only carry a single target for now",
      };
    }

    const params: Record<string, string> = {
      judgeSystemPrompt: request.judgeSystemPromptHash,
    };

    const target = request.targets[0];
    const detailResult = await this.deps.runQuery.getRunDetail(target.runId);
    if (!detailResult.ok) {
      return { ok: false, error: detailResult.error };
    }
    const detail = detailResult.value;

    const step = detail.steps.find((s) => s.stepId === target.stepId);
    const exp = step?.exports?.find((e) => e.name === target.exportName);
    if (!exp) {
      return {
        ok: false,
        error: `Export not found: run ${target.runId}, step ${target.stepId}, export ${target.exportName}`,
      };
    }
    params[target.paramName] = exp.artifactHash;

    await this.#resolveDeclaredContext(target, detail, params);

    const evalRunId = this.deps.runService.makeRunId();

    try {
      await this.deps.runService.requestRun({
        flowId: request.evalFlowId,
        flowVersionId: request.evalFlowVersionId,
        flowDefHash: request.evalFlowDefHash,
        source: request.source,
        runId: evalRunId,
        experimentId: request.experimentId,
        targetRunId: target.runId,
        targetStepId: target.stepId,
        targetExportName: target.exportName,
        params,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (request.experimentId) {
      await this.deps.runRepository.updateRun({
        id: target.runId,
        experimentId: request.experimentId,
      });
    }

    return { ok: true, value: { evalRunId } };
  }

  async listByTargetShape(shape: {
    flowId: string;
    stepId: string;
    exportName: string;
  }): Promise<EvalResultRecord[]> {
    return this.deps.evalResults.listByTargetShape(shape);
  }

  async listByExperimentId(experimentId: string): Promise<EvalResultRecord[]> {
    return this.deps.evalResults.listByExperimentId(experimentId);
  }

  // Best-effort: if the target's flow declares evalContext for this export,
  // auto-resolve it against the same run and add it to params. A flow with
  // no such declaration (or a source that can't be resolved) is judged with
  // whatever it has — the caller isn't required to know about this at all.
  async #resolveDeclaredContext(
    target: { runId: string; stepId: string; exportName: string },
    detail: RunDetail,
    params: Record<string, string>,
  ): Promise<void> {
    const definitionHash = detail.flowVersion?.definitionHash;
    if (!definitionHash) return;

    const flowDefResult = await this.deps.artifacts.load(
      definitionHash,
      "application/json",
    );
    if (!flowDefResult.ok) return;

    const parsedFlow = FlowSchema.safeParse(flowDefResult.value);
    if (!parsedFlow.success) return;

    const step = parsedFlow.data.steps[target.stepId];
    const exportDecl =
      step?.type === "httpjson" ? step.exports?.[target.exportName] : undefined;
    const evalContext = exportDecl?.evalContext;
    if (!evalContext) return;

    for (const [contextParamName, source] of Object.entries(evalContext)) {
      const hash = resolveContextSource(source, detail);
      if (hash) params[contextParamName] = hash;
    }
  }
}
