import { describe, it, expect, vi } from "vitest";
import type { LimiterDeps } from "../../src/limiter.js";
import { Limiter } from "../../src/limiter.js";
import type {
  ConcurrencyLimiterPort,
  EmitterFactoryPort,
  EventBusPort,
  SlotAccessDecision,
} from "@lcase/ports";

const toolId = "test-toolid";

describe("Limiter emitResponse()", () => {
  it("emits limiter.slot.granted or limiter.slot.denied correctly for each decision", async () => {
    const bus = {} as unknown as EventBusPort;
    const emit = vi.fn().mockReturnValue({});
    const newLimiterEmitterNewSpan = vi.fn().mockReturnValue({ emit });
    const ef = { newLimiterEmitterNewSpan } as unknown as EmitterFactoryPort;

    const decisions: SlotAccessDecision[] = [
      {
        granted: true,
        jobId: "test-jobid1",
        runId: "test-runid1",
        traceId: "test-traceid1",
        workerId: "test-workerid1",
      },
      {
        granted: false,
        jobId: "test-jobid2",
        runId: "test-runid2",
        traceId: "test-traceid2",
        workerId: "test-workerid2",
      },
    ];

    const cl = {} as unknown as ConcurrencyLimiterPort;
    const deps: LimiterDeps = { bus, ef, cl };

    const limiter = new Limiter("limiter-id", "global", deps, false);

    await limiter.emitResponse(decisions[0], toolId);
    await limiter.emitResponse(decisions[1], toolId);

    expect(newLimiterEmitterNewSpan).toHaveBeenNthCalledWith(
      1,
      {
        limiterid: "limiter-id",
        source: "lowercase://limiter/global/limiter-id",
      },
      decisions[0].traceId,
    );
    expect(newLimiterEmitterNewSpan).toHaveBeenNthCalledWith(
      2,
      {
        limiterid: "limiter-id",
        source: "lowercase://limiter/global/limiter-id",
      },
      decisions[1].traceId,
    );

    expect(emit).toHaveBeenNthCalledWith(1, "limiter.slot.granted", {
      jobId: decisions[0].jobId,
      runId: decisions[0].runId,
      workerId: decisions[0].workerId,
      toolId,
      status: "granted",
    });
    expect(emit).toHaveBeenNthCalledWith(2, "limiter.slot.denied", {
      jobId: decisions[1].jobId,
      runId: decisions[1].runId,
      workerId: decisions[1].workerId,
      toolId,
      status: "denied",
    });
  });
});
