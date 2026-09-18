import type { RunContext } from "@lcase/types";
import type { WritableDraft } from "immer";

export function setRunStatus(run: WritableDraft<RunContext>) {
  if (run.outstandingSteps === 0 && Object.keys(run.failedSteps).length > 0) {
    run.status = "failed";
  } else if (run.outstandingSteps === 0) {
    run.status = "completed";
  }
}
