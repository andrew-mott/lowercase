import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactReaderPort,
  EvalResultRepositoryPort,
  RunQueryPort,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
import { EvalResultProjectionSink } from "../src/sinks/eval-result-projection.sink.js";

function makeEvalRunRequestedEvent(
  data: Partial<AnyEvent<"run.requested">["data"]> = {},
): AnyEvent<"run.requested"> {
  return {
    flowversionid: "eval-flow-version-1",
    type: "run.requested",
    action: "requested",
    data: {
      flowId: "eval-flow-1",
      flowVersionId: "eval-flow-version-1",
      flowDefHash: "a".repeat(64),
      targetRunId: "run-subject",
      targetStepId: "reportForecast",
      targetExportName: "answer",
      experimentId: "exp-1",
      ...data,
    },
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id",
    flowid: "eval-flow-1",
    runid: "run-eval",
    id: "event-1",
    source: "lowercase://test/requested",
    specversion: "1.0",
    domain: "run",
    time: "2026-07-08T10:00:00.000Z",
  };
}

function makeRunCompletedEvent(runid = "run-eval"): AnyEvent<"run.completed"> {
  return {
    flowversionid: "eval-flow-version-1",
    type: "run.completed",
    action: "completed",
    data: null,
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id-2",
    flowid: "eval-flow-1",
    runid,
    id: "event-2",
    source: "lowercase://test/completed",
    specversion: "1.0",
    domain: "run",
    time: "2026-07-08T10:00:05.000Z",
  };
}

const validPayload = {
  overall: 0.9,
  passed: true,
  dimensions: {
    correctness: { score: 0.9 },
  },
};

function makeRunQuery(
  exports: Array<{ name: string; artifactHash: string }> = [
    { name: "score", artifactHash: "b".repeat(64) },
  ],
): RunQueryPort {
  return {
    listRuns: vi.fn(),
    getReusableStepData: vi.fn(),
    getRunDetail: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        run: { id: "run-eval" },
        steps: [{ runId: "run-eval", stepId: "judge", exports }],
      },
    }),
  } as unknown as RunQueryPort;
}

function makeArtifacts(value: unknown = validPayload): ArtifactReaderPort {
  return {
    load: vi.fn().mockResolvedValue({ ok: true, value }),
  } as unknown as ArtifactReaderPort;
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("EvalResultProjectionSink", () => {
  it("stores an eval result once the eval run completes", async () => {
    const evalResults: EvalResultRepositoryPort = {
      createEvalResult: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      listByExperimentId: vi.fn(),
      listByTargetRunId: vi.fn(),
      listByTargetShape: vi.fn(),
    };
    const runQuery = makeRunQuery();
    const artifacts = makeArtifacts();

    const sink = new EvalResultProjectionSink(evalResults, artifacts, runQuery);
    sink.handle(makeEvalRunRequestedEvent());
    sink.handle(makeRunCompletedEvent());

    await waitForMicrotasks();

    expect(runQuery.getRunDetail).toHaveBeenCalledWith("run-eval");
    expect(artifacts.load).toHaveBeenCalledWith(
      "b".repeat(64),
      "application/json",
    );
    expect(evalResults.createEvalResult).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRunId: "run-subject",
        targetStepId: "reportForecast",
        targetExportName: "answer",
        evalRunId: "run-eval",
        evalFlowId: "eval-flow-1",
        evalFlowVersionId: "eval-flow-version-1",
        experimentId: "exp-1",
        overall: 0.9,
        passed: true,
        payload: validPayload,
      }),
    );
  });

  it("ignores runs that never declared a targetRunId", async () => {
    const evalResults: EvalResultRepositoryPort = {
      createEvalResult: vi.fn(),
      listByExperimentId: vi.fn(),
      listByTargetRunId: vi.fn(),
      listByTargetShape: vi.fn(),
    };
    const runQuery = makeRunQuery();
    const artifacts = makeArtifacts();

    const sink = new EvalResultProjectionSink(evalResults, artifacts, runQuery);
    sink.handle(makeEvalRunRequestedEvent({ targetRunId: undefined }));
    sink.handle(makeRunCompletedEvent());

    await waitForMicrotasks();

    expect(runQuery.getRunDetail).not.toHaveBeenCalled();
    expect(evalResults.createEvalResult).not.toHaveBeenCalled();
  });

  it("does not store a result when the score export is still missing after retrying", async () => {
    const evalResults: EvalResultRepositoryPort = {
      createEvalResult: vi.fn(),
      listByExperimentId: vi.fn(),
      listByTargetRunId: vi.fn(),
      listByTargetShape: vi.fn(),
    };
    const runQuery = makeRunQuery([]);
    const artifacts = makeArtifacts();

    const sink = new EvalResultProjectionSink(
      evalResults,
      artifacts,
      runQuery,
      [0, 0],
    );
    sink.handle(makeEvalRunRequestedEvent());
    const handled = sink.handle(makeRunCompletedEvent());

    await handled;

    expect(runQuery.getRunDetail).toHaveBeenCalledTimes(3);
    expect(evalResults.createEvalResult).not.toHaveBeenCalled();
  });

  it("retries past a SqlRunProjectionSink race and stores the result once the export lands", async () => {
    const evalResults: EvalResultRepositoryPort = {
      createEvalResult: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      listByExperimentId: vi.fn(),
      listByTargetRunId: vi.fn(),
      listByTargetShape: vi.fn(),
    };
    const getRunDetail = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { run: { id: "run-eval" }, steps: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { run: { id: "run-eval" }, steps: [] },
      })
      .mockResolvedValue({
        ok: true,
        value: {
          run: { id: "run-eval" },
          steps: [
            {
              runId: "run-eval",
              stepId: "judge",
              exports: [{ name: "score", artifactHash: "b".repeat(64) }],
            },
          ],
        },
      });
    const runQuery = { getRunDetail } as unknown as RunQueryPort;
    const artifacts = makeArtifacts();

    const sink = new EvalResultProjectionSink(
      evalResults,
      artifacts,
      runQuery,
      [0, 0, 0],
    );
    sink.handle(makeEvalRunRequestedEvent());
    const handled = sink.handle(makeRunCompletedEvent());

    await handled;

    expect(getRunDetail).toHaveBeenCalledTimes(3);
    expect(evalResults.createEvalResult).toHaveBeenCalledWith(
      expect.objectContaining({ evalRunId: "run-eval", overall: 0.9 }),
    );
  });

  it("does not store a result when the score export fails schema validation", async () => {
    const evalResults: EvalResultRepositoryPort = {
      createEvalResult: vi.fn(),
      listByExperimentId: vi.fn(),
      listByTargetRunId: vi.fn(),
      listByTargetShape: vi.fn(),
    };
    const runQuery = makeRunQuery();
    const artifacts = makeArtifacts({ not: "a valid payload" });

    const sink = new EvalResultProjectionSink(evalResults, artifacts, runQuery);
    sink.handle(makeEvalRunRequestedEvent());
    sink.handle(makeRunCompletedEvent());

    await waitForMicrotasks();

    expect(evalResults.createEvalResult).not.toHaveBeenCalled();
  });
});
