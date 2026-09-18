import { createSemaphore, type Semaphore } from "./concurrency/semaphore.js";
import type { JobIdentity } from "./submitted-message.js";

export type WorkerCapacityConfig = {
  maxConcurrentJobs: number;
};

// Permit/capacity activity is telemetry, not a durable lifecycle fact --
// matches the existing worker.job.dequeued precedent (Telemetry, owned by
// the queue-consumer layer, not worker core). All hooks optional.
// Typed on JobIdentity rather than the submitted Message: counting active jobs
// needs which job, never the envelope, and a submission is accepted here as-is.
export type WorkerCapacityTelemetry = {
  onWaitStart?(job: JobIdentity): void;
  onGranted?(job: JobIdentity): void;
  onCancelled?(job: JobIdentity): void;
  onReleased?(job: JobIdentity): void;
};

export type CapacityAcquisition =
  { kind: "granted"; release(): void } | { kind: "cancelled" };

// Worker's component-wide active-job bound, owned by Worker rather than
// wrapped around it. The invariant has to stay Worker's regardless of how
// work arrives: a carrier's own in-flight limit bounds what that carrier
// presents, which stops being the same gate the moment a second subscription
// binds to the same Worker or a log-backed host reads in batches.
export class WorkerCapacity {
  readonly #semaphore: Semaphore;
  readonly #telemetry: WorkerCapacityTelemetry | undefined;

  constructor(
    config: WorkerCapacityConfig,
    telemetry?: WorkerCapacityTelemetry,
  ) {
    this.#semaphore = createSemaphore(config.maxConcurrentJobs);
    this.#telemetry = telemetry;
  }

  get available(): number {
    return this.#semaphore.available;
  }

  async acquire(
    job: JobIdentity,
    callerSignal?: AbortSignal,
  ): Promise<CapacityAcquisition> {
    // An already-abandoned job never joins the queue, so it produces no wait
    // or cancellation telemetry -- there was nothing to wait for or cancel.
    if (callerSignal?.aborted) {
      return { kind: "cancelled" };
    }

    this.#telemetry?.onWaitStart?.(job);
    const outcome = await this.#semaphore.acquire(callerSignal);
    if (outcome.kind === "cancelled") {
      this.#telemetry?.onCancelled?.(job);
      return { kind: "cancelled" };
    }
    this.#telemetry?.onGranted?.(job);

    // Handing `release` out makes double-release expressible in a way the
    // previous decorator's internal `finally` did not, so guard it here
    // rather than trusting every future call site not to inflate capacity.
    let released = false;
    return {
      kind: "granted",
      release: () => {
        if (released) return;
        released = true;
        outcome.release();
        this.#telemetry?.onReleased?.(job);
      },
    };
  }
}
