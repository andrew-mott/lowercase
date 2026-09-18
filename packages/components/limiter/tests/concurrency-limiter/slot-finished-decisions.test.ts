import { describe, it, expect } from "vitest";
import {
  ConcurrencyLimiter,
  type ToolCounters,
  type ToolQueues,
} from "../../src/concurrency-limiter.js";
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
  type: "worker.slot.finished",
  data: {
    jobId: "test-jobid",
    runId: "test-runid",
    toolId: toolId,
  },
  domain: "worker",
  action: "finished",
  traceparent: "",
  traceid: "test-traceid",
  spanid: "",
  workerid: "test-workerid",
} satisfies AnyEvent<"worker.slot.finished">;

describe("ConcurrencyLimiter slotFinishedResults()", () => {
  it("decrements counter and emits nothing when no items are in the queue", () => {
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

    const initialToolCounters: ToolCounters = {
      [toolId]: { count: 5, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };
    cl.toolCounters = initialToolCounters;

    const finalToolCounters: ToolCounters = {
      [toolId]: { count: 4, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };

    const results = cl.slotFinishedDecisions(event);
    const expectedResults: SlotAccessDecision[] = [];

    expect(cl.toolQueues[toolId].length).toBe(0);
    expect(cl.toolCounters).toEqual(finalToolCounters);
    expect(results).toEqual(expectedResults);
  });
  it("keeps counter and emits one queued item when one slot opens up", () => {
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

    const finalToolQueues: ToolQueues = {
      [toolId]: [
        {
          workerId: "worker2",
          runId: "run2",
          jobId: "job2",
          traceId: "trace2",
        },
      ],
    };
    cl.toolQueues = {
      [toolId]: [
        {
          workerId: "worker1",
          runId: "run1",
          jobId: "job1",
          traceId: "trace1",
        },
        {
          workerId: "worker2",
          runId: "run2",
          jobId: "job2",
          traceId: "trace2",
        },
      ],
    };

    const initialToolCounters: ToolCounters = {
      [toolId]: { count: 5, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };
    cl.toolCounters = initialToolCounters;

    const finalToolCounters: ToolCounters = {
      [toolId]: { count: 5, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };

    const results = cl.slotFinishedDecisions(event);
    const expectedResults: SlotAccessDecision[] = [
      {
        granted: true,
        jobId: "job1",
        runId: "run1",
        traceId: "trace1",
        workerId: "worker1",
      },
    ];

    expect(cl.toolQueues[toolId].length).toBe(1);
    expect(cl.toolCounters).toEqual(finalToolCounters);
    expect(cl.toolQueues).toEqual(finalToolQueues);
    expect(results).toEqual(expectedResults);
  });
});
