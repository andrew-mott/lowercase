import type { AnyEvent } from "@lcase/types";

export const runStartedEvent = {
  id: "test-id",
  source: "test-source",
  specversion: "1.0",
  time: "test-time",
  type: "run.started",
  data: null,
  domain: "run",
  action: "started",
  traceparent: "test-traceparent",
  traceid: "test-traceid",
  spanid: "test-spanid",
  flowid: "test-flowid",
  flowversionid: "test-flowversionid",
  runid: "test-runid",
} satisfies AnyEvent<"run.started">;
