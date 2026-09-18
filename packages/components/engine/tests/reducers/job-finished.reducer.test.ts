import { buildEvent } from "@lcase/events";
import { describe, expect, it } from "vitest";
import { jobFinishedReducer } from "../../src/reducers/job-finished.reducer.js";
import type { JobFinishedMsg } from "../../src/engine.types.js";
import { stepPlannedNewState } from "../fixtures/step-planned.state.js";

function completedMessage(overrides?: {
  runid?: string;
  stepid?: string;
}): JobFinishedMsg {
  return {
    type: "JobFinished",
    event: buildEvent(
      "job.httpjson.completed",
      { status: "success", output: "output-hash" },
      {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: overrides?.runid ?? "test-runid",
        stepid: overrides?.stepid ?? "parallel",
        jobid: "job-1",
        capid: "httpjson",
        toolid: "httpjson",
        source: "lowercase://worker",
      },
    ),
  };
}

describe("jobFinishedReducer", () => {
  it("marks the step completed and records its output", () => {
    const state = jobFinishedReducer(stepPlannedNewState, completedMessage());

    const step = state.runs["test-runid"]!.steps["parallel"]!;
    expect(step.status).toBe("completed");
    expect(step.outputHash).toBe("output-hash");
    expect(state.runs["test-runid"]!.completedSteps["parallel"]).toBe(true);
    expect(state.runs["test-runid"]!.startedSteps["parallel"]).toBeUndefined();
  });

  // The guard used to sit *below* the dereference that needed it, so an
  // unrecognized runid threw inside the immer producer. A terminal arriving
  // by subscription can be unknown or stale, and that has to be an
  // intentional no-op rather than a TypeError taking down a delivery loop.
  it("returns state unchanged for an unknown runid rather than throwing", () => {
    expect(() =>
      jobFinishedReducer(
        stepPlannedNewState,
        completedMessage({ runid: "unknown-runid" }),
      ),
    ).not.toThrow();

    expect(
      jobFinishedReducer(
        stepPlannedNewState,
        completedMessage({ runid: "unknown-runid" }),
      ),
    ).toEqual(stepPlannedNewState);
  });

  it("returns state unchanged for an unknown stepid", () => {
    expect(
      jobFinishedReducer(
        stepPlannedNewState,
        completedMessage({ stepid: "unknown-stepid" }),
      ),
    ).toEqual(stepPlannedNewState);
  });
});
