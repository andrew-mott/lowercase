import { buildEvent } from "@lcase/events";
import type { HttpSubmission } from "../../src/http-submitted-message.js";
import type { JobRunContext, Work } from "../../src/job.contracts.js";
import type { HttpJsonSubmission } from "../../src/submitted-message.js";

// Worker's entry point speaks the submitted Message; JobRunner speaks work +
// context. Separate fixtures rather than one derived from the other, so a
// runner test never has to dress its input as a Message first.

type SubmissionOverrides = {
  scope?: Partial<{
    flowid: string;
    flowversionid: string;
    runid: string;
    stepid: string;
    jobid: string;
    source: string;
  }>;
  data?: Partial<HttpJsonSubmission["data"]>;
};

type HttpSubmissionOverrides = {
  scope?: Partial<{
    flowid: string;
    flowversionid: string;
    runid: string;
    stepid: string;
    jobid: string;
    source: string;
  }>;
  data?: Partial<HttpSubmission["data"]>;
};

// Built with buildEvent rather than hand-written, so every fixture is a
// schema-valid envelope with a real derived span -- the same object the engine
// would publish.
export function makeSubmission(
  overrides: SubmissionOverrides = {},
): HttpJsonSubmission {
  return buildEvent(
    "job.httpjson.submitted",
    {
      url: "https://example.test/resource",
      refs: [],
      ...overrides.data,
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
      ...overrides.scope,
    },
  );
}

// Built with buildEvent rather than hand-written, mirroring makeSubmission.
export function makeHttpSubmission(
  overrides: HttpSubmissionOverrides = {},
): HttpSubmission {
  return buildEvent(
    "job.http.submitted",
    {
      url: "https://example.test/resource",
      refs: [],
      ...overrides.data,
    },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      capid: "http",
      toolid: "http",
      source: "lowercase://engine",
      ...overrides.scope,
    },
  );
}

export function makeWork(overrides?: Partial<Work>): Work {
  return {
    protocol: { kind: "httpjson", url: "https://example.test/resource" },
    refs: [],
    ...overrides,
  };
}

export function makeHttpWork(overrides?: Partial<Work>): Work {
  return {
    protocol: { kind: "http", url: "https://example.test/resource" },
    refs: [],
    ...overrides,
  };
}

export function makeContext(overrides?: Partial<JobRunContext>): JobRunContext {
  return { permitRequestId: "job-1", ...overrides };
}
