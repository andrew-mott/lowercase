import type { StepHttpJson } from "../../../generated/http-json.step.gen.js";
import type { ExportRef } from "../../../flow-analysis/types.js";
import type { JobSubmittedData } from "../data.js";

export type JobHttpJsonData = Omit<
  StepHttpJson,
  "type" | "on" | "tool" | "exports"
>;
export type JobHttpJsonSubmittedData = JobHttpJsonData &
  JobSubmittedData & {
    exportRefs?: Record<string, ExportRef>;
  };
export type JobHttpJsonQueuedData = JobHttpJsonData &
  JobSubmittedData & {
    exportRefs?: Record<string, ExportRef>;
  };
