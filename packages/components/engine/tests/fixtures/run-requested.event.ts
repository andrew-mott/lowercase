import type { AnyEvent } from "@lcase/types";

export const runRequestedEvent: AnyEvent<"run.requested"> = {
  type: "run.requested",
  action: "requested",
  data: {
    flowId: "test-flowid-rel",
    flowVersionId: "test-flowversionid",
    flowDefHash: "test-flowdefhash",
  },
  traceparent: "test-traceparent",
  traceid: "test-traceid",
  spanid: "test-spanid",
  flowid: "test-flowid",
  flowversionid: "test-flowversionid",
  runid: "test-runid",
  id: "test-id",
  source: "test-source",
  specversion: "1.0",
  domain: "run",
  time: "test-time",
};
