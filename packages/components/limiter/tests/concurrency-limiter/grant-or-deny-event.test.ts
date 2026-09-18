import { describe, it, expect } from "vitest";
import type { JobEntry } from "../../src/concurrency-limiter.js";
import { ConcurrencyLimiter } from "../../src/concurrency-limiter.js";
import type {
  EmitterFactoryPort,
  EventBusPort,
  SlotAccessDecision,
} from "@lcase/ports";
import type { AnyEvent, ToolSpec } from "@lcase/types";

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

describe("ConcurrencyLimiter grantOrDenyEvent()", () => {
  it("grants a slot when tool has capacity and increments concurrency count", () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;
    const cl = new ConcurrencyLimiter(bus, ef);

    const config: ToolSpec[] = [
      {
        id: toolId,
        maxConcurrency: 5,
        capabilities: [],
        location: "internal",
      },
      {
        id: "test-id2",
        maxConcurrency: 4,
        capabilities: [],
        location: "internal",
      },
    ];

    cl.loadConfig(config);

    const results = cl.grantOrDenyEvent(event);
    const expectedResults: SlotAccessDecision = {
      granted: true,
      jobId: "test-jobid",
      runId: "test-runid",
      traceId: "test-traceid",
      workerId: "test-workerid",
    };

    expect(cl.toolQueues[toolId].length).toBe(0);
    expect(cl.toolCounters[toolId].count).toBe(1);
    expect(results).toEqual(expectedResults);
  });
  it("denies a slot and queues job when tool has no capacity", () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;
    const cl = new ConcurrencyLimiter(bus, ef);

    const config: ToolSpec[] = [
      {
        id: toolId,
        maxConcurrency: 0,
        capabilities: [],
        location: "internal",
      },
    ];

    cl.loadConfig(config);

    const results = cl.grantOrDenyEvent(event);
    const expectedResults: SlotAccessDecision = {
      granted: false,
      jobId: "test-jobid",
      runId: "test-runid",
      traceId: "test-traceid",
      workerId: "test-workerid",
    };
    const expectedQueueEntry: JobEntry = {
      jobId: "test-jobid",
      runId: "test-runid",
      traceId: "test-traceid",
      workerId: "test-workerid",
    };

    expect(cl.toolQueues[toolId]).toEqual([expectedQueueEntry]);
    expect(cl.toolCounters[toolId].count).toBe(0);
    expect(results).toEqual(expectedResults);
  });
});
