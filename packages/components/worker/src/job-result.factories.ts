import type {
  ArtifactRef,
  JobExecutionError,
  JobResult,
} from "./job.contracts.js";

// Worker's terminal result construction, kept beside the command contracts
// rather than inside worker.ts: JobRunner reports a modelled outcome and
// Worker turns it into one of these, so the mapping from outcome to result is
// worth reading in one place.
//
// None of these take job identity: a JobResult says how a job ended, and the
// submission it ended for is held by whoever is about to build the terminal.

export type StoredExecutionOutputs = {
  output: ArtifactRef;
  exports?: Record<string, ArtifactRef>;
};

export function cancelledResult(): JobResult {
  return {
    status: "failed",
    error: {
      code: "CANCELLED",
      message: "Job execution was cancelled",
      retryable: false,
    },
  };
}

export function failedResult(
  error: JobExecutionError,
  output?: ArtifactRef,
): JobResult {
  return {
    status: "failed",
    error,
    ...(output ? { output } : {}),
  };
}

export function completedResult(outputs: StoredExecutionOutputs): JobResult {
  return {
    status: "completed",
    ...outputs,
  };
}
