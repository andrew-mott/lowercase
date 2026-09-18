import { describe, it, expect, vi } from "vitest";
import type { LimiterDeps } from "../../src/limiter.js";
import { Limiter } from "../../src/limiter.js";
import type {
  ConcurrencyLimiterPort,
  EmitterFactoryPort,
  EventBusPort,
  SlotAccessDecision,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

const toolId = "test-toolid";
const event = {
  id: "test-id",
  source: "",
  specversion: "1.0",
  time: "",
  type: "worker.slot.requested",
  data: {
    jobId: "test-jobid",
    runId: "test-runid",
    toolId: toolId,
  },
  domain: "worker",
  action: "requested",
  traceparent: "",
  traceid: "test-traceid",
  spanid: "",
  workerid: "test-workerid",
} satisfies AnyEvent<"worker.slot.requested">;

describe("Limiter handleSlotFinished()", () => {
  it("invokes emitResponse for each concurrency decision received", async () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;

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
    const slotRequestDecisions = vi.fn().mockReturnValue(decisions);
    const cl = { slotRequestDecisions } as unknown as ConcurrencyLimiterPort;
    const deps: LimiterDeps = { bus, ef, cl };

    const limiter = new Limiter("limiter-id", "global", deps, false);
    const emitResponse = vi
      .spyOn(limiter, "emitResponse")
      .mockImplementation(async () => undefined);

    await limiter.handleSlotRequested(event);

    expect(emitResponse).toHaveBeenNthCalledWith(1, decisions[0], toolId);
    expect(emitResponse).toHaveBeenNthCalledWith(2, decisions[1], toolId);
  });
  it("invokes emitResponse() zero times when array is empty", async () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;

    const decisions: SlotAccessDecision[] = [];
    const slotRequestDecisions = vi.fn().mockReturnValue(decisions);
    const cl = { slotRequestDecisions } as unknown as ConcurrencyLimiterPort;
    const deps: LimiterDeps = { bus, ef, cl };

    const limiter = new Limiter("limiter-id", "global", deps, false);
    const emitResponse = vi
      .spyOn(limiter, "emitResponse")
      .mockImplementation(async () => undefined);

    await limiter.handleSlotRequested(event);

    expect(emitResponse).not.toHaveBeenCalled();
  });
});
