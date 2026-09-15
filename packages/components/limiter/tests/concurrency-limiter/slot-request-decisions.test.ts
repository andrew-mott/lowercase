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

describe("ConcurrencyLimiter slotRequestResults()", () => {
  it("Grants the queued and requested event when capacity exists", () => {
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
    cl.toolQueues = structuredClone(toolQueues);

    const finalToolCounters: ToolCounters = {
      [toolId]: { count: 3, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };

    const results = cl.slotRequestDecisions(event);
    const expectedResults = [
      {
        granted: true,
        runId: "run1",
        jobId: "job1",
        traceId: "trace1",
        workerId: "worker1",
      },
      {
        granted: true,
        runId: "run2",
        jobId: "job2",
        traceId: "trace2",
        workerId: "worker2",
      },
      {
        granted: true,
        runId: "test-runid",
        jobId: "test-jobid",
        traceId: "test-traceid",
        workerId: "test-workerid",
      },
    ] satisfies SlotAccessDecision[];

    expect(cl.toolQueues[toolId].length).toBe(0);
    expect(cl.toolCounters).toEqual(finalToolCounters);
    expect(cl.toolQueues).toEqual({ [toolId]: [] });
    expect(results).toEqual(expectedResults);
  });

  it("Grants one queued and denies/queued requested event when capacity gets exceeded", () => {
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
    const finalToolQueues: ToolQueues = {
      [toolId]: [
        {
          workerId: "worker2",
          runId: "run2",
          jobId: "job2",
          traceId: "trace2",
        },
        {
          workerId: "test-workerid",
          runId: "test-runid",
          jobId: "test-jobid",
          traceId: "test-traceid",
        },
      ],
    };
    cl.toolQueues = structuredClone(toolQueues);

    const finalToolCounters: ToolCounters = {
      [toolId]: { count: 1, limit: 1 },
      "test-id2": { count: 0, limit: 4 },
    };

    const results = cl.slotRequestDecisions(event);
    const expectedResults = [
      {
        granted: true,
        runId: "run1",
        jobId: "job1",
        traceId: "trace1",
        workerId: "worker1",
      },
      {
        granted: false,
        runId: "test-runid",
        jobId: "test-jobid",
        traceId: "test-traceid",
        workerId: "test-workerid",
      },
    ] satisfies SlotAccessDecision[];

    expect(cl.toolQueues[toolId].length).toBe(2);
    expect(cl.toolCounters).toEqual(finalToolCounters);
    expect(cl.toolQueues).toEqual(finalToolQueues);
    expect(results).toEqual(expectedResults);
  });
});
