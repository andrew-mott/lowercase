import type { StepHttp } from "../../../generated/http.step.gen.js";
import type { ExportRef } from "../../../flow-analysis/types.js";
import type { JobSubmittedData } from "../data.js";

export type JobHttpData = Omit<StepHttp, "type" | "on" | "exports">;
export type JobHttpSubmittedData = JobHttpData &
  JobSubmittedData & {
    exportRefs?: Record<string, ExportRef>;
  };
