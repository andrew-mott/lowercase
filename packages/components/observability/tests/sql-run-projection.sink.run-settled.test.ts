import { describe, expect, it, vi } from "vitest";
import type {
  RunRepositoryPort,
  RunSettledPublisherPort,
  RunStepProjectionRepositoryPort,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
import { SqlRunProjectionSink } from "../src/sinks/sql-run-projection.sink.js";

const base = {
  traceparent: "trace-parent",
  traceid: "trace-id",
  spanid: "span-id",
  flowid: "a".repeat(64),
  flowversionid: "flow-version-1",
  runid: "run-1",
  source: "lowercase://test",
  specversion: "1.0",
} as const;

const requested = {
  ...base,
  type: "run.requested",
  action: "requested",
  domain: "run",
  id: "event-1",
  time: "2026-07-02T10:00:00.000Z",
  data: {
    flowId: "flow-1",
    flowVersionId: "flow-version-1",
    flowDefHash: "a".repeat(64),
  },
} as AnyEvent<"run.requested">;

const runCompleted = {
  ...base,
  type: "run.completed",
  action: "completed",
  domain: "run",
  id: "event-2",
  time: "2026-07-02T10:00:05.000Z",
  data: null,
} as AnyEvent<"run.completed">;

const runDenied = {
  ...base,
  type: "run.denied",
  action: "denied",
  domain: "run",
  id: "event-3",
  time: "2026-07-02T10:00:01.000Z",
  data: { error: "Error making run plan." },
} as AnyEvent<"run.denied">;

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Every write and every settled report, in the order they happened.
function makeSink() {
  const log: string[] = [];
  const runs = {
    createRun: vi.fn().mockImplementation(async (input) => {
      log.push(`run:${input.status}`);
      return { ok: true, value: {} };
    }),
  } as unknown as RunRepositoryPort;
  const steps = {
    upsertStepProjection: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  } as unknown as RunStepProjectionRepositoryPort;
  const runSettled: RunSettledPublisherPort = {
    settled: (runId) => log.push(`settled:${runId}`),
  };
  return { sink: new SqlRunProjectionSink(runs, steps, runSettled), log };
}

describe("SqlRunProjectionSink run settled", () => {
  it("reports a run settled only after its terminal status is written", async () => {
    const { sink, log } = makeSink();

    sink.handle(requested);
    sink.handle(runCompleted);
    await settle();

    expect(log.at(-2)).toBe("run:completed");
    expect(log.at(-1)).toBe("settled:run-1");
  });

  it("stores a denied run as failed and reports it settled", async () => {
    const { sink, log } = makeSink();

    sink.handle(requested);
    sink.handle(runDenied);
    await settle();

    expect(log.at(-2)).toBe("run:failed");
    expect(log.at(-1)).toBe("settled:run-1");
  });

  it("does not report a run that has not finished", async () => {
    const { sink, log } = makeSink();

    sink.handle(requested);
    await settle();

    expect(log.some((entry) => entry.startsWith("settled"))).toBe(false);
  });
});
