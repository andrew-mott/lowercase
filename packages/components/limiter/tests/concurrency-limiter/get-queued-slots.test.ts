import { describe, it, expect } from "vitest";
import type { ToolQueues } from "../../src/concurrency-limiter.js";
import { ConcurrencyLimiter } from "../../src/concurrency-limiter.js";
import type {
  EmitterFactoryPort,
  EventBusPort,
  SlotAccessDecision,
} from "@lcase/ports";
import type { ToolSpec } from "@lcase/types";

const toolId = "test-toolid";

const toolQueues: ToolQueues = {
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

describe("ConcurrencyLimiter getQueuedSlots()", () => {
  it("dequeues all jobs when it doesnt hit concurrency capacity limit", () => {
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

    const toolQueues: ToolQueues = {
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
    cl.toolQueues = toolQueues;

    expect(cl.toolQueues[toolId].length).toBe(2);
    const results = cl.addQueuedSlots(toolId, []);
    const expectedResults: SlotAccessDecision[] = [
      {
        granted: true,
        workerId: "worker1",
        runId: "run1",
        jobId: "job1",
        traceId: "trace1",
      },
      {
        granted: true,
        workerId: "worker2",
        runId: "run2",
        jobId: "job2",
        traceId: "trace2",
      },
    ];

    expect(cl.toolQueues[toolId].length).toBe(0);
    expect(cl.toolCounters[toolId].count).toBe(2);
    expect(results).toEqual(expectedResults);
  });

  it("dequeues jobs up until it hits concurrency capacity", () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;
    const cl = new ConcurrencyLimiter(bus, ef);

    const config: ToolSpec[] = [
      {
        id: toolId,
        maxConcurrency: 1,
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

    cl.toolQueues = toolQueues;

    expect(cl.toolQueues[toolId].length).toBe(2);
    const results = cl.addQueuedSlots(toolId, []);
    const expectedResults: SlotAccessDecision[] = [
      {
        granted: true,
        workerId: "worker1",
        runId: "run1",
        jobId: "job1",
        traceId: "trace1",
      },
    ];

    expect(cl.toolQueues[toolId].length).toBe(1);
    expect(cl.toolCounters[toolId].count).toBe(1);
    expect(results).toEqual(expectedResults);
  });
});
