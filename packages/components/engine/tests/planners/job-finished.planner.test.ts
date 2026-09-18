import { buildEvent } from "@lcase/events";
import { describe, expect, it } from "vitest";
import { jobFinishedPlanner } from "../../src/planners/job-finished.planner.js";
import { jobFinishedReducer } from "../../src/reducers/job-finished.reducer.js";
import type { JobFinishedMsg } from "../../src/engine.types.js";
import { stepPlannedNewState } from "../fixtures/step-planned.state.js";

function completedMessage(): JobFinishedMsg {
  return {
    type: "JobFinished",
    event: buildEvent(
      "job.httpjson.completed",
      { status: "success", output: "output-hash" },
      {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        stepid: "parallel",
        jobid: "job-1",
        capid: "httpjson",
        toolid: "httpjson",
        source: "lowercase://worker",
      },
    ),
  };
}

describe("jobFinishedPlanner", () => {
  it("emits step.completed on the transition into completed", () => {
    const message = completedMessage();
    const newState = jobFinishedReducer(stepPlannedNewState, message);

    const effects = jobFinishedPlanner(stepPlannedNewState, newState, message);

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      type: "EmitStepCompleted",
      scope: { runid: "test-runid", stepid: "parallel" },
      data: { status: "success", outputHash: "output-hash" },
    });
  });

  // The reducer is idempotent -- completing an already-completed step produces
  // the same state -- so without a transition guard a second terminal for one
  // step would emit step.completed again and fan its dependents out twice.
  // Nothing redelivers today; this is what keeps that from becoming a silent
  // correctness bug the moment something does.
  it("plans nothing for a second terminal on an already-completed step", () => {
    const message = completedMessage();
    const afterFirst = jobFinishedReducer(stepPlannedNewState, message);
    const afterSecond = jobFinishedReducer(afterFirst, message);

    const effects = jobFinishedPlanner(afterFirst, afterSecond, message);

    expect(effects).toEqual([]);
  });
});
