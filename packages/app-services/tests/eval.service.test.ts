import { describe, expect, it, vi } from "vitest";
import { EvalService } from "../src/eval.service.js";
import type {
  ArtifactReaderPort,
  EvalResultRepositoryPort,
  RunQueryPort,
  RunRepositoryPort,
  RunServicePort,
} from "@lcase/ports";

function makeRunService(): RunServicePort {
  return {
    requestRun: vi.fn().mockResolvedValue(undefined),
    makeRunId: vi.fn().mockReturnValue("run-eval-1"),
    listAllRuns: vi.fn(),
    listRunsByFlowVersionId: vi.fn(),
    getRunDetail: vi.fn(),
    getRunParams: vi.fn(),
  };
}

function makeRunQuery(
  options: {
    withFlowVersion?: boolean;
    exports?: Array<{ name: string; artifactHash: string }>;
  } = {},
): RunQueryPort {
  const exports = options.exports ?? [
    { name: "answer", artifactHash: "a".repeat(64) },
  ];
  return {
    listRuns: vi.fn(),
    getReusableStepData: vi.fn(),
    getRunDetail: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        run: { id: "run-subject" },
        params: [{ name: "userWeatherQuery", artifactHash: "d".repeat(64) }],
        steps: [
          {
            runId: "run-subject",
            stepId: "reportForecast",
            outputHash: "e".repeat(64),
            exports,
          },
          {
            runId: "run-subject",
            stepId: "getForecast",
            outputHash: "f".repeat(64),
          },
        ],
        ...(options.withFlowVersion
          ? { flowVersion: { id: "fv-1", definitionHash: "g".repeat(64) } }
          : {}),
      },
    }),
  } as unknown as RunQueryPort;
}

function makeRunRepository(): RunRepositoryPort {
  return {
    createRun: vi.fn(),
    updateRun: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    getRun: vi.fn(),
    listRuns: vi.fn(),
  };
}

function makeEvalResults(): EvalResultRepositoryPort {
  return {
    createEvalResult: vi.fn(),
    listByExperimentId: vi.fn(),
    listByTargetRunId: vi.fn(),
    listByTargetShape: vi.fn(),
  };
}

function makeArtifacts(flowDef: unknown = undefined): ArtifactReaderPort {
  return {
    load: vi.fn().mockResolvedValue(
      flowDef === undefined
        ? {
            ok: false,
            error: { code: "STORE_GET_FAILED", message: "no flow" },
          }
        : { ok: true, value: flowDef },
    ),
  } as unknown as ArtifactReaderPort;
}

const baseRequest = {
  targets: [
    {
      runId: "run-subject",
      stepId: "reportForecast",
      exportName: "answer",
      paramName: "subjectAnswer",
    },
  ],
  evalFlowId: "eval-flow-1",
  evalFlowVersionId: "eval-flow-version-1",
  evalFlowDefHash: "b".repeat(64),
  judgeSystemPromptHash: "c".repeat(64),
  experimentId: "exp-1",
  source: "lowercase://test",
};

describe("EvalService", () => {
  it("resolves the target export and starts an eval run with it bound as a param", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    const result = await service.startEvalRun(baseRequest);

    expect(result).toEqual({ ok: true, value: { evalRunId: "run-eval-1" } });
    expect(runQuery.getRunDetail).toHaveBeenCalledWith("run-subject");
    expect(runService.requestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "eval-flow-1",
        flowVersionId: "eval-flow-version-1",
        flowDefHash: "b".repeat(64),
        runId: "run-eval-1",
        experimentId: "exp-1",
        targetRunId: "run-subject",
        targetStepId: "reportForecast",
        targetExportName: "answer",
        params: {
          subjectAnswer: "a".repeat(64),
          judgeSystemPrompt: "c".repeat(64),
        },
      }),
    );
    expect(runRepository.updateRun).toHaveBeenCalledWith({
      id: "run-subject",
      experimentId: "exp-1",
    });
  });

  it("auto-resolves declared evalContext into additional params", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery({ withFlowVersion: true });
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts({
      name: "weather-flow",
      version: "v1",
      start: "reportForecast",
      steps: {
        reportForecast: {
          type: "httpjson",
          url: "http://example.test",
          exports: {
            answer: {
              ref: "{{output.body}}",
              type: "text/markdown",
              evalContext: {
                originalQuestion: { source: "param", name: "userWeatherQuery" },
                groundingContext: { source: "output", stepId: "getForecast" },
              },
            },
          },
        },
      },
    });
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    await service.startEvalRun(baseRequest);

    expect(runService.requestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          subjectAnswer: "a".repeat(64),
          judgeSystemPrompt: "c".repeat(64),
          originalQuestion: "d".repeat(64),
          groundingContext: "f".repeat(64),
        },
      }),
    );
  });

  it("falls back to just the target param when the flow declares no evalContext", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery({ withFlowVersion: true });
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts({
      name: "weather-flow",
      version: "v1",
      start: "reportForecast",
      steps: {
        reportForecast: {
          type: "httpjson",
          url: "http://example.test",
          exports: {
            answer: { ref: "{{output.body}}", type: "text/markdown" },
          },
        },
      },
    });
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    await service.startEvalRun(baseRequest);

    expect(runService.requestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          subjectAnswer: "a".repeat(64),
          judgeSystemPrompt: "c".repeat(64),
        },
      }),
    );
  });

  it("falls back to just the target param when the run has no resolvable flow version", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    await service.startEvalRun(baseRequest);

    expect(artifacts.load).not.toHaveBeenCalled();
    expect(runService.requestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          subjectAnswer: "a".repeat(64),
          judgeSystemPrompt: "c".repeat(64),
        },
      }),
    );
  });

  it("fails clearly when the target export does not exist", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    const result = await service.startEvalRun({
      ...baseRequest,
      targets: [
        {
          runId: "run-subject",
          stepId: "reportForecast",
          exportName: "missing-export",
          paramName: "subjectAnswer",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(runService.requestRun).not.toHaveBeenCalled();
  });

  it("rejects more than one target since storage only supports a single target for now", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults: makeEvalResults(),
    });

    const result = await service.startEvalRun({
      ...baseRequest,
      targets: [
        ...baseRequest.targets,
        {
          runId: "run-subject-2",
          stepId: "reportForecast",
          exportName: "answer",
          paramName: "otherAnswer",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(runQuery.getRunDetail).not.toHaveBeenCalled();
    expect(runService.requestRun).not.toHaveBeenCalled();
  });

  it("delegates listByTargetShape to the repository", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const evalResults = makeEvalResults();
    (
      evalResults.listByTargetShape as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ id: "eval-result-1" }]);
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults,
    });

    const result = await service.listByTargetShape({
      flowId: "flow-1",
      stepId: "reportForecast",
      exportName: "answer",
    });

    expect(evalResults.listByTargetShape).toHaveBeenCalledWith({
      flowId: "flow-1",
      stepId: "reportForecast",
      exportName: "answer",
    });
    expect(result).toEqual([{ id: "eval-result-1" }]);
  });

  it("delegates listByExperimentId to the repository", async () => {
    const runService = makeRunService();
    const runQuery = makeRunQuery();
    const runRepository = makeRunRepository();
    const artifacts = makeArtifacts();
    const evalResults = makeEvalResults();
    (
      evalResults.listByExperimentId as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ id: "eval-result-2" }]);
    const service = new EvalService({
      runService,
      runQuery,
      runRepository,
      artifacts,
      evalResults,
    });

    const result = await service.listByExperimentId("exp-1");

    expect(evalResults.listByExperimentId).toHaveBeenCalledWith("exp-1");
    expect(result).toEqual([{ id: "eval-result-2" }]);
  });
});
