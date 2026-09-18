import type { CloudScope } from "@lcase/types";

export type EmitterContext = {
  traceId: string;
  spandId: string;
  parentSpanId: string;
  flowId?: string;
  runId?: string;
  stepId?: string;
  jobId?: string;
};
export type EnvelopeHeader = {
  id: string;
  time: string;
  specversion: "1.0";
  traceparent: string;
  traceid: string;
  spanid: string;
  parentspanid?: string;
} & CloudScope;

export type OtelContext = {
  traceId: string;
  spanId: string;
  traceParent: string;
  parentSpanId?: string;
};
