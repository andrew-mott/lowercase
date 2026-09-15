import { describe, expect, it } from "vitest";
import { updateRunIndex } from "../src/update-run-index.js";
import type { AnyEvent, RunIndex } from "@lcase/types";

describe("run-history updateRunIndex()", () => {
  it("processes a run.requested event correctly", () => {
    const runRequested = {
      type: "run.requested",
      flowid: "test-flowid",
      runid: "test-runid",
      traceid: "test-traceid",
      data: {
        flowId: "flow-rel-id",
        flowVersionId: "flow-version-id",
        flowDefHash: "test-flowdefhash",
        forkSpecHash: "test-forkspechash",
        params: {
          payload: "payload-hash",
        },
      },
    } as unknown as AnyEvent<"run.requested">;

    const index = updateRunIndex(runRequested, undefined);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      steps: {},
      traceId: "test-traceid",
      flowDefHash: "test-flowdefhash",
      forkSpecHash: "test-forkspechash",
      params: {
        payload: "payload-hash",
      },
    };
    expect(index).toEqual(expectedIndex);
  });

  it("processes a run.started event correctly", () => {
    const stepStarted = {
      type: "run.started",
      flowid: "test-flowid",
      runid: "test-runid",
      traceid: "test-traceid",
      time: "test-time",

      data: {
        status: "started",
      },
    } as unknown as AnyEvent<"run.started">;

    const index = updateRunIndex(stepStarted);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      startTime: "test-time",
      steps: {},
      traceId: "test-traceid",
    };
    expect(index).toEqual(expectedIndex);
  });

  it("processes a run.completed event correctly", () => {
    const stepStarted = {
      type: "run.completed",
      flowid: "test-flowid",
      runid: "test-runid",
      traceid: "test-traceid",
      time: "test-time",

      data: {
        status: "started",
      },
    } as unknown as AnyEvent<"run.completed">;

    const index = updateRunIndex(stepStarted);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      endTime: "test-time",
      steps: {},
      traceId: "test-traceid",
    };
    expect(index).toEqual(expectedIndex);
  });

  it("processes a step.started event correctly", () => {
    const stepStarted = {
      type: "step.started",
      flowid: "test-flowid",
      runid: "test-runid",
      traceid: "test-traceid",
      time: "test-time",
      stepid: "test-stepid",
      data: {
        status: "started",
      },
    } as unknown as AnyEvent<"step.started">;

    const index = updateRunIndex(stepStarted);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      steps: {
        "test-stepid": {
          startTime: "test-time",
          status: "started",
        },
      },
      traceId: "test-traceid",
    };
    expect(index).toEqual(expectedIndex);
  });

  it("processes a step.completed event correctly", () => {
    const stepStarted = {
      type: "step.completed",
      flowid: "test-flowid",
      runid: "test-runid",
      traceid: "test-traceid",
      time: "test-time",
      stepid: "test-stepid",
      data: {
        status: "success",
        exportHashes: {
          parsed: "parsed-hash",
        },
      },
    } as unknown as AnyEvent<"step.completed">;

    const index = updateRunIndex(stepStarted);
    const expectedIndex: RunIndex = {
      flowId: "test-flowid",
      steps: {
        "test-stepid": {
          endTime: "test-time",
          exportHashes: {
            parsed: "parsed-hash",
          },
          status: "success",
        },
      },
      traceId: "test-traceid",
    };
    expect(index).toEqual(expectedIndex);
  });
});
