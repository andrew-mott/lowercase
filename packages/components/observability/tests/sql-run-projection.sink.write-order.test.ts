import { describe, expect, it, vi } from "vitest";
import type {
  RunRepositoryPort,
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

const stepCompleted = {
  ...base,
  type: "step.completed",
  action: "completed",
  domain: "step",
  id: "event-2",
  stepid: "fetch",
  steptype: "httpjson",
  time: "2026-07-02T10:00:04.000Z",
  data: {
    step: { id: "fetch", name: "fetch", type: "httpjson" },
    status: "success",
    outputHash: "c".repeat(64),
  },
} as AnyEvent<"step.completed">;

const runCompleted = {
  ...base,
  type: "run.completed",
  action: "completed",
  domain: "run",
  id: "event-3",
  time: "2026-07-02T10:00:05.000Z",
  data: null,
} as AnyEvent<"run.completed">;

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Every write, in the order it reached the repositories.
function makeSink(options?: { failFirstRunWrite?: boolean }) {
  const writes: string[] = [];
  let runWrites = 0;
  const runs = {
    createRun: vi.fn().mockImplementation(async (input) => {
      writes.push(`run:${input.status}`);
      runWrites += 1;
      if (options?.failFirstRunWrite && runWrites === 1) {
        return { ok: false, error: "unavailable" };
      }
      return { ok: true, value: {} };
    }),
  } as unknown as RunRepositoryPort;
  const steps = {
    upsertStepProjection: vi.fn().mockImplementation(async (input) => {
      writes.push(`step:${input.stepId}`);
      return { ok: true, value: {} };
    }),
  } as unknown as RunStepProjectionRepositoryPort;
  return { sink: new SqlRunProjectionSink(runs, steps), writes };
}

describe("SqlRunProjectionSink write order", () => {
  it("stores a terminal run status after its steps", async () => {
    const { sink, writes } = makeSink();

    sink.handle(requested);
    await settle();
    writes.length = 0;

    sink.handle(stepCompleted);
    sink.handle(runCompleted);
    await settle();

    expect(writes.at(-1)).toBe("run:completed");
    expect(writes.indexOf("step:fetch")).toBeLessThan(
      writes.indexOf("run:completed"),
    );
  });

  it("writes the run row before steps when none has been stored yet", async () => {
    // The first write fails, so by the time the flush retries the run is
    // already terminal and no row exists.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sink, writes } = makeSink({ failFirstRunWrite: true });

    sink.handle(requested);
    sink.handle(stepCompleted);
    sink.handle(runCompleted);
    await settle();

    // Steps hold a foreign key to the run row, so a row must exist before
    // them, but it must not yet say the run is finished.
    expect(writes.slice(1)).toEqual([
      "run:started",
      "step:fetch",
      "run:completed",
    ]);
  });
});
