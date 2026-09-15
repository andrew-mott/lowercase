import { describe, it, expect } from "vitest";
import { initRunIndex } from "../src/init-run-index.js";
import type { AnyEvent, RunIndex } from "@lcase/types";

describe("run-history initRunIndex()", () => {
  it("generates a valid run index when given a valid", () => {
    const event = {
      id: "test-id",
      source: "test-source",
      specversion: "1.0",
      time: "test-time",
      type: "run.requested",
      data: {
        flowId: "flow-rel-id",
        flowVersionId: "flow-version-id",
        flowDefHash: "test-flowdefhash",
        forkSpecHash: undefined,
      },
      domain: "run",
      action: "requested",
      traceparent: "test-traceparent",
      traceid: "test-traceid",
      spanid: "test-spanid",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
    } satisfies AnyEvent<"run.requested">;

    const index = initRunIndex(event);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      steps: {},
      traceId: "test-traceid",
    };
    expect(index).toEqual(expectedIndex);
  });
  it("returned undefined when given an invalid event", () => {
    const event = {
      id: "test-id",
      source: "test-source",
      specversion: "1.0",
      time: "test-time",
      type: "flow.submitted",
      data: {
        definition: {
          name: "",
          version: "",
          start: "",
          steps: {},
        },
        flow: {
          id: "",
          name: "",
          version: "",
        },
        inputs: {},
        run: {
          id: "",
        },
      },
      domain: "flow",
      action: "submitted",
      traceparent: "test-traceparent",
      traceid: "test-traceid",
      spanid: "test-spanid",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
    } satisfies AnyEvent<"flow.submitted">;

    const index = initRunIndex(event);
    expect(index).toBe(undefined);
  });
});
