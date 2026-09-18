import type { AnyEvent } from "@lcase/types";

export const stepPlannedEvent: AnyEvent<"step.planned"> = {
  data: {
    step: {
      id: "parallel",
      name: "parallel",
      type: "parallel",
    },
  },
  id: "test-id",
  source: "test-source",
  specversion: "1.0",
  time: "test-time",
  type: "step.planned",
  domain: "step",
  action: "planned",
  traceparent: "test-traceparent",
  traceid: "test-traceid",
  spanid: "test-spanid",
  flowid: "test-flowid",
  flowversionid: "test-flowversionid",
  runid: "test-runid",
  stepid: "parallel",
  steptype: "parallel",
};
