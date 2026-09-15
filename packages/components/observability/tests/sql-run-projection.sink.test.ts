import { describe, expect, it, vi } from "vitest";
import type {
  RunRepositoryPort,
  RunStepProjectionRepositoryPort,
} from "@lcase/ports";
import type {
  AnyEvent,
  Result,
  RunRecord,
  RunStepProjectionRecord,
} from "@lcase/types";
import { SqlRunProjectionSink } from "../src/sinks/sql-run-projection.sink.js";

function makeRunRequestedEvent(): AnyEvent<"run.requested"> {
  return {
    type: "run.requested",
    action: "requested",
    data: {
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      flowDefHash: "a".repeat(64),
      forkSpecHash: "b".repeat(64),
    },
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id",
    flowid: "a".repeat(64),
    flowversionid: "flow-version-1",
    runid: "run-1",
    id: "event-1",
    source: "lowercase://test/requested",
    specversion: "1.0",
    domain: "run",
    time: "2026-07-02T10:00:00.000Z",
  };
}

function makeRunStartedEvent(): AnyEvent<"run.started"> {
  return {
    type: "run.started",
    action: "started",
    data: null,
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id-2",
    flowid: "a".repeat(64),
    flowversionid: "flow-version-1",
    runid: "run-1",
    id: "event-2",
    source: "lowercase://test/started",
    specversion: "1.0",
    domain: "run",
    time: "2026-07-02T10:00:01.000Z",
  };
}

function makeStepStartedEvent(): AnyEvent<"step.started"> {
  return {
    type: "step.started",
    action: "started",
    data: {
      status: "started",
      step: {
        id: "fetch",
        name: "fetch",
        type: "httpjson",
      },
    },
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id-3",
    flowid: "a".repeat(64),
    flowversionid: "flow-version-1",
    runid: "run-1",
    stepid: "fetch",
    steptype: "httpjson",
    id: "event-3",
    source: "lowercase://test/step-started",
    specversion: "1.0",
    domain: "step",
    time: "2026-07-02T10:00:02.000Z",
  };
}

function makeStepCompletedEvent(): AnyEvent<"step.completed"> {
  return {
    type: "step.completed",
    action: "completed",
    data: {
      step: {
        id: "fetch",
        name: "fetch",
        type: "httpjson",
      },
      status: "success",
      outputHash: "c".repeat(64),
      exportHashes: {
        body: "d".repeat(64),
      },
    },
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id-4",
    flowid: "a".repeat(64),
    flowversionid: "flow-version-1",
    runid: "run-1",
    stepid: "fetch",
    steptype: "httpjson",
    id: "event-4",
    source: "lowercase://test/step-completed",
    specversion: "1.0",
    domain: "step",
    time: "2026-07-02T10:00:04.000Z",
  };
}

function makeRunCompletedEvent(): AnyEvent<"run.completed"> {
  return {
    type: "run.completed",
    action: "completed",
    data: null,
    traceparent: "trace-parent",
    traceid: "trace-id",
    spanid: "span-id-5",
    flowid: "a".repeat(64),
    flowversionid: "flow-version-1",
    runid: "run-1",
    id: "event-5",
    source: "lowercase://test/completed",
    specversion: "1.0",
    domain: "run",
    time: "2026-07-02T10:00:05.000Z",
  };
}

function okRunRecord(
  input: Partial<RunRecord> = {},
): Result<RunRecord, string> {
  return {
    ok: true,
    value: {
      id: "run-1",
      traceId: "trace-id",
      status: "requested",
      source: "lowercase://test",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      flowDefHash: "a".repeat(64),
      createdAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:00:00.000Z",
      ...input,
    },
  };
}

function okStepRecord(
  input: Partial<RunStepProjectionRecord> = {},
): Result<RunStepProjectionRecord, string> {
  return {
    ok: true,
    value: {
      runId: "run-1",
      stepId: "fetch",
      ...input,
    },
  };
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SqlRunProjectionSink", () => {
  it("writes run and step projections from incoming events", async () => {
    const runs: RunRepositoryPort = {
      createRun: vi.fn().mockResolvedValue(okRunRecord()),
      updateRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
    };
    const steps: RunStepProjectionRepositoryPort = {
      upsertStepProjection: vi.fn().mockResolvedValue(okStepRecord()),
      getStepProjection: vi.fn(),
      listStepProjections: vi.fn(),
    };

    const sink = new SqlRunProjectionSink(runs, steps);
    sink.handle(makeRunRequestedEvent());
    sink.handle(makeRunStartedEvent());
    sink.handle(makeStepStartedEvent());
    sink.handle(makeStepCompletedEvent());
    sink.handle(makeRunCompletedEvent());

    await waitForMicrotasks();

    expect(runs.createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "run-1",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        status: "completed",
        startTime: "2026-07-02T10:00:01.000Z",
        endTime: "2026-07-02T10:00:05.000Z",
        duration: 4,
      }),
    );
    expect(steps.upsertStepProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        stepId: "fetch",
        status: "success",
        startTime: "2026-07-02T10:00:02.000Z",
        endTime: "2026-07-02T10:00:04.000Z",
        duration: 2,
        outputHash: "c".repeat(64),
        exportHashes: { body: "d".repeat(64) },
      }),
    );
  });

  it("stores reused step metadata", async () => {
    const runs: RunRepositoryPort = {
      createRun: vi.fn().mockResolvedValue(okRunRecord()),
      updateRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
    };
    const steps: RunStepProjectionRepositoryPort = {
      upsertStepProjection: vi.fn().mockResolvedValue(okStepRecord()),
      getStepProjection: vi.fn(),
      listStepProjections: vi.fn(),
    };

    const sink = new SqlRunProjectionSink(runs, steps);
    sink.handle(makeRunRequestedEvent());
    sink.handle({
      type: "step.reused",
      action: "reused",
      data: {
        status: "success",
        outputHash: "b".repeat(64),
        exportHashes: { body: "c".repeat(64) },
        sourceRunId: "run-parent",
      },
      traceparent: "trace-parent",
      traceid: "trace-id",
      spanid: "span-id-6",
      flowid: "a".repeat(64),
      runid: "run-1",
      stepid: "fetch",
      steptype: "httpjson",
      id: "event-6",
      source: "lowercase://test/step-reused",
      specversion: "1.0",
      domain: "step",
      time: "2026-07-02T10:00:03.000Z",
    });

    await waitForMicrotasks();

    expect(steps.upsertStepProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        stepId: "fetch",
        status: "success",
        reusedTime: "2026-07-02T10:00:03.000Z",
        wasReused: true,
        outputHash: "b".repeat(64),
        exportHashes: { body: "c".repeat(64) },
      }),
    );
  });

  it("serializes writes per run and coalesces overlapping flushes", async () => {
    let activeWrites = 0;
    let maxConcurrentWrites = 0;
    let releaseWrite: (() => void) | undefined;

    const createRun = vi.fn().mockImplementation(async () => {
      activeWrites++;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
      await new Promise<void>((resolve) => {
        releaseWrite = () => resolve();
      });
      activeWrites--;
      return okRunRecord({ status: "requested" });
    });

    const runs: RunRepositoryPort = {
      createRun,
      updateRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
    };
    const steps: RunStepProjectionRepositoryPort = {
      upsertStepProjection: vi.fn().mockResolvedValue(okStepRecord()),
      getStepProjection: vi.fn(),
      listStepProjections: vi.fn(),
    };

    const sink = new SqlRunProjectionSink(runs, steps);
    sink.handle(makeRunRequestedEvent());
    sink.handle(makeRunStartedEvent());

    await waitForMicrotasks();
    expect(createRun).toHaveBeenCalledTimes(1);

    releaseWrite?.();
    await waitForMicrotasks();

    expect(maxConcurrentWrites).toBe(1);
    expect(createRun).toHaveBeenCalledTimes(2);
    expect(createRun.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        id: "run-1",
        status: "started",
        startTime: "2026-07-02T10:00:01.000Z",
      }),
    );

    releaseWrite?.();
    await waitForMicrotasks();
  });
});
