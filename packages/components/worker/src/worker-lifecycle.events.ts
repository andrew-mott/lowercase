import type { ArtifactRef, JobExecutionError } from "./job.contracts.js";
import type { JobIdentity } from "./submitted-message.js";

// Deliberately keyed on `kind`, not `type` -- this is not an `AnyEvent` and
// must not read as bus-compatible. Recorded directly via
// `WorkerLifecycleEventSink.record()`, never published on the bus.
//
// Field names stay camelCase while the submitted Message they are derived from
// is lowercase: this is worker's own recorded fact shape that sinks read, not
// a Message, and reading like one would be misleading.
export type WorkerLifecycleEventBase = {
  jobId: string;
  runId: string;
  stepId: string;
  traceId?: string;
  time: string;
};

export type WorkerLifecycleEvent =
  | (WorkerLifecycleEventBase & { kind: "job-execution-started" })
  | (WorkerLifecycleEventBase & {
      kind: "job-execution-completed";
      output: ArtifactRef;
      exports?: Record<string, ArtifactRef>;
    })
  | (WorkerLifecycleEventBase & {
      kind: "job-execution-failed";
      error: JobExecutionError;
    })
  | (WorkerLifecycleEventBase & { kind: "job-execution-cancelled" });

function baseFrom(job: JobIdentity): WorkerLifecycleEventBase {
  return {
    jobId: job.jobid,
    runId: job.runid,
    stepId: job.stepid,
    traceId: job.traceid,
    time: new Date().toISOString(),
  };
}

export function makeJobExecutionStartedEvent(
  job: JobIdentity,
): WorkerLifecycleEvent {
  return { ...baseFrom(job), kind: "job-execution-started" };
}

export function makeJobExecutionCompletedEvent(
  job: JobIdentity,
  output: ArtifactRef,
  exports?: Record<string, ArtifactRef>,
): WorkerLifecycleEvent {
  return {
    ...baseFrom(job),
    kind: "job-execution-completed",
    output,
    exports,
  };
}

export function makeJobExecutionFailedEvent(
  job: JobIdentity,
  error: JobExecutionError,
): WorkerLifecycleEvent {
  return { ...baseFrom(job), kind: "job-execution-failed", error };
}

export function makeJobExecutionCancelledEvent(
  job: JobIdentity,
): WorkerLifecycleEvent {
  return { ...baseFrom(job), kind: "job-execution-cancelled" };
}
