import type { CapId } from "../../flow/map.js";
import type { JobHttpJsonEventMap } from "./httpjson/map.js";
import type { JobHttpEventMap } from "./http/map.js";
import type { JobMcpEventMap } from "./mcp/map.js";

export type DomainCapActionDescriptor<
  Domain extends string,
  Id extends CapId,
  Action extends string,
  Data,
> = {
  domain: Domain;
  entity: Id;
  action: Action;
  data: Data;
};

export type JobEventMap = JobHttpJsonEventMap &
  JobMcpEventMap &
  JobHttpEventMap;

export type JobEventType = keyof JobEventMap;

export type JobEventData<T extends JobEventType> = JobEventMap[T]["data"];
export type JobOtelAttributesMap = {
  [T in JobEventType]: Omit<JobEventMap[T], "data">;
};

export type JobSubmittedType = Extract<JobEventType, `${string}.submitted`>;
export type JobDelayedType = Extract<JobEventType, `${string}.delayed`>;
export type JobResumedType = Extract<JobEventType, `${string}.resumed`>;
export type JobQueuedType = Extract<JobEventType, `${string}.queued`>;
export type JobStartedType = Extract<JobEventType, `${string}.started`>;
export type JobCompletedType = Extract<JobEventType, `${string}.completed`>;
export type JobFailedType = Extract<JobEventType, `${string}.failed`>;
