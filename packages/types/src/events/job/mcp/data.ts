import type { StepMcp } from "../../../generated/flow-definition.gen.js";
import type { JobQueuedData, JobSubmittedData } from "../data.js";

export type JobMcpData = Omit<StepMcp, "type" | "on" | "tool">;
export type JobMcpSubmittedData = JobMcpData & JobSubmittedData;
export type JobMcpQueuedData = JobMcpData & JobQueuedData;
