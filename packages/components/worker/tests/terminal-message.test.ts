import { buildEvent } from "@lcase/events";
import { describe, expect, it } from "vitest";
import type { JobResult } from "../src/job.contracts.js";
import type { HttpJsonSubmission } from "../src/submitted-message.js";
import { buildJobTerminal } from "../src/terminal-message.js";

const WORKER_SOURCE = "lowercase://worker";

function makeSubmitted(): HttpJsonSubmission {
  return buildEvent(
    "job.httpjson.submitted",
    {
      url: "https://example.test/resource",
      refs: [],
      exportRefs: {
        greeting: {
          exportName: "greeting",
          valuePath: ["output", "greeting"],
          scope: "output",
          string: "steps.x.exports.greeting",
          type: "text/plain",
        },
      },
    },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      capid: "httpjson",
      toolid: "httpjson",
      source: "lowercase://engine",
    },
  );
}

const completed: Extract<JobResult, { status: "completed" }> = {
  status: "completed",
  output: { hash: "output-hash" },
  exports: { greeting: { hash: "greeting-hash" } },
};

describe("buildJobTerminal", () => {
  it("maps a completed result to one job.httpjson.completed Message", () => {
    const terminal = buildJobTerminal(
      makeSubmitted(),
      completed,
      WORKER_SOURCE,
    );

    expect(terminal.type).toBe("job.httpjson.completed");
    expect(terminal.data).toEqual({
      status: "success",
      output: "output-hash",
      exportHashes: { greeting: "greeting-hash" },
    });
  });

  it("omits exportHashes entirely when the job produced no exports", () => {
    const terminal = buildJobTerminal(
      makeSubmitted(),
      { status: "completed", output: { hash: "output-hash" } },
      WORKER_SOURCE,
    );

    expect(terminal.data).toEqual({ status: "success", output: "output-hash" });
  });

  it("maps a failed result to one job.httpjson.failed Message", () => {
    const terminal = buildJobTerminal(
      makeSubmitted(),
      {
        status: "failed",
        error: {
          code: "HTTP_STATUS_FAILED",
          message: "upstream said no",
          retryable: true,
        },
        output: { hash: "error-payload-hash" },
      },
      WORKER_SOURCE,
    );

    expect(terminal.type).toBe("job.httpjson.failed");
    expect(terminal.data).toEqual({
      status: "failure",
      output: "error-payload-hash",
      message: "upstream said no",
    });
  });

  it("uses a null output when a failure stored no payload", () => {
    const terminal = buildJobTerminal(
      makeSubmitted(),
      {
        status: "failed",
        error: { code: "TIMEOUT", message: "too slow", retryable: false },
      },
      WORKER_SOURCE,
    );

    expect(terminal.data).toMatchObject({ status: "failure", output: null });
  });

  it("carries job scope from the submission and stamps worker as the source", () => {
    const submitted = makeSubmitted();
    const terminal = buildJobTerminal(submitted, completed, WORKER_SOURCE);

    expect(terminal).toMatchObject({
      flowid: submitted.flowid,
      flowversionid: submitted.flowversionid,
      runid: submitted.runid,
      stepid: submitted.stepid,
      jobid: submitted.jobid,
      capid: submitted.capid,
      toolid: submitted.toolid,
    });
    expect(terminal.source).toBe(WORKER_SOURCE);
    expect(submitted.source).toBe("lowercase://engine");
  });

  it("is a new Message: fresh id and time, same trace, span parented on the step", () => {
    const submitted = makeSubmitted();
    const terminal = buildJobTerminal(submitted, completed, WORKER_SOURCE);

    expect(terminal.id).not.toBe(submitted.id);
    expect(terminal.traceid).toBe(submitted.traceid);
    // Both are job-domain events for the same job, so the registered job span
    // policy derives one span for the pair -- and its parent is the step's.
    expect(terminal.spanid).toBe(submitted.spanid);
    expect(terminal.parentspanid).toBeDefined();
    expect(terminal.parentspanid).not.toBe(terminal.spanid);
  });

  it("leaks no submitted-only field into the terminal", () => {
    const terminal = buildJobTerminal(
      makeSubmitted(),
      completed,
      WORKER_SOURCE,
    );

    for (const leaked of ["refs", "exportRefs", "url", "method", "headers"]) {
      expect(terminal).not.toHaveProperty(leaked);
      expect(terminal.data).not.toHaveProperty(leaked);
    }
  });

  // A deliberate limitation, asserted so it cannot be quietly assumed away:
  // JobFailedData has no code or retryable field, so worker's modelled error
  // codes do not reach anyone reading the Message.
  it("drops the error code and retryability, leaving cancellation indistinguishable", () => {
    const cancelled = buildJobTerminal(
      makeSubmitted(),
      {
        status: "failed",
        error: {
          code: "CANCELLED",
          message: "Job execution was cancelled",
          retryable: false,
        },
      },
      WORKER_SOURCE,
    );
    const networkFailure = buildJobTerminal(
      makeSubmitted(),
      {
        status: "failed",
        error: {
          code: "HTTP_NETWORK_FAILED",
          message: "Job execution was cancelled",
          retryable: true,
        },
      },
      WORKER_SOURCE,
    );

    expect(cancelled.data).not.toHaveProperty("code");
    expect(cancelled.data).not.toHaveProperty("retryable");
    // Same type, same data: only the prose message could tell them apart, and
    // here it does not.
    expect(cancelled.type).toBe(networkFailure.type);
    expect(cancelled.data).toEqual(networkFailure.data);
  });
});
