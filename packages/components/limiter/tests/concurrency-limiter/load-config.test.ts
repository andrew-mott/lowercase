import { describe, it, expect } from "vitest";
import {
  ConcurrencyLimiter,
  type ToolCounters,
  type ToolQueues,
} from "../../src/concurrency-limiter.js";
import type { EmitterFactoryPort, EventBusPort } from "@lcase/ports";
import type { ToolSpec } from "@lcase/types";

describe("ConcurrencyLimiter loadConfig()", () => {
  it("creates valid state when loading a config", () => {
    const bus = {} as unknown as EventBusPort;
    const ef = {} as unknown as EmitterFactoryPort;
    const cl = new ConcurrencyLimiter(bus, ef);

    const config: ToolSpec[] = [
      {
        id: "test-id",
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

    const toolCounters: ToolCounters = {
      "test-id": { count: 0, limit: 5 },
      "test-id2": { count: 0, limit: 4 },
    };

    const toolQueues: ToolQueues = {
      "test-id": [],
      "test-id2": [],
    };

    expect(cl.toolCounters).toEqual(toolCounters);
    expect(cl.toolQueues).toEqual(toolQueues);
  });
});
