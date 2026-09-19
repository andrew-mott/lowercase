import type { DomainEntityActionDescriptor } from "../../shared/otel-attributes.js";
import type { JobCompletedData, JobFailedData } from "../data.js";
import type { JobHttpSubmittedData } from "./data.js";

export type JobHttpEventMap = {
  "job.http.submitted": DomainEntityActionDescriptor<
    "job",
    "http",
    "submitted",
    JobHttpSubmittedData
  >;
  "job.http.completed": DomainEntityActionDescriptor<
    "job",
    "http",
    "completed",
    JobCompletedData
  >;
  "job.http.failed": DomainEntityActionDescriptor<
    "job",
    "http",
    "failed",
    JobFailedData
  >;
};

export type JobHttpEventType = keyof JobHttpEventMap;
