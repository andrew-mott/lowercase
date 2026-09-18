import type { ArtifactReadWritePort, MessagePublisher } from "@lcase/ports";
import { JobRunner } from "./job-runner.js";
import {
  cancelledResult,
  completedResult,
  failedResult,
} from "./job-result.factories.js";
import type { JobResult } from "./job.contracts.js";
import type { ResourcePermitPort } from "./ports/outbound/resource-permit.port.js";
import type { WorkerLifecycleEventSink } from "./ports/outbound/worker-event-sink.port.js";
import type { ProtocolExecutor } from "./protocol/protocol-executor.types.js";
import type { ResourceKeyResolver } from "./resource-key-resolver.js";
import {
  toHttpJsonWork,
  type HttpJsonSubmission,
} from "./submitted-message.js";
import { buildJobTerminal, type JobTerminalType } from "./terminal-message.js";
import {
  WorkerCapacity,
  type WorkerCapacityTelemetry,
} from "./worker-capacity.js";
import {
  makeJobExecutionCancelledEvent,
  makeJobExecutionCompletedEvent,
  makeJobExecutionFailedEvent,
  makeJobExecutionStartedEvent,
} from "./worker-lifecycle.events.js";

export type WorkerDeps = {
  permits: ResourcePermitPort;
  lifecycle: WorkerLifecycleEventSink;
  protocol: ProtocolExecutor;
  artifacts: ArtifactReadWritePort;
  // Bound to one topic by runtime, so Worker cannot route a Message
  // anywhere else. It is the only messaging dependency Worker has -- no
  // router, no mailbox, no topology, no Engine callback.
  terminal: MessagePublisher<JobTerminalType>;
  resourceKeyResolver?: ResourceKeyResolver;
  capacityTelemetry?: WorkerCapacityTelemetry;
};

export type WorkerConfig = {
  maxConcurrentJobs: number;
  protocolTimeoutMs: number;
  // The CloudEvent source stamped on every Message Worker publishes. Supplied
  // by runtime rather than hardcoded here: component identity is composition's
  // to decide, and for this slice the source is all the identity needed.
  source: string;
};

// The submitted Message is schema-validated at construction, so these are the
// checks a valid envelope can still fail. Protocol kind is deliberately not
// among them -- it is fixed by the Message type and cannot be wrong.
function validateSubmission(submission: HttpJsonSubmission): void {
  if (!submission.jobid) {
    throw new Error("job.httpjson.submitted jobid is required");
  }
  if (!submission.runid) {
    throw new Error("job.httpjson.submitted runid is required");
  }
  if (!submission.stepid) {
    throw new Error("job.httpjson.submitted stepid is required");
  }
}

// The worker component itself: the object runtime constructs and retains.
// It owns the component-wide capacity bound and the accepted/started/terminal
// lifecycle sequence, and delegates the mechanics of one job to JobRunner.
// JobRunner and WorkerCapacity are built here rather than injected, so there
// is no way to compose a Worker that bypasses either.
export class Worker {
  readonly #lifecycle: WorkerLifecycleEventSink;
  readonly #capacity: WorkerCapacity;
  readonly #runner: JobRunner;
  readonly #terminal: MessagePublisher<JobTerminalType>;
  readonly #source: string;

  constructor(deps: WorkerDeps, config: WorkerConfig) {
    this.#lifecycle = deps.lifecycle;
    this.#terminal = deps.terminal;
    this.#source = config.source;
    this.#capacity = new WorkerCapacity(
      { maxConcurrentJobs: config.maxConcurrentJobs },
      deps.capacityTelemetry,
    );
    this.#runner = new JobRunner(deps, {
      protocolTimeoutMs: config.protocolTimeoutMs,
    });
  }

  /**
   * Worker's Message boundary: one accepted submission in, one terminal
   * Message out.
   *
   * An arrow property so runtime can bind it without wrapping it in something
   * that could grow policy of its own. The returned Promise is the delivery's
   * truth boundary -- it resolves only once the terminal has been admitted, so
   * an unexpected throw from execution rejects here and publishes nothing
   * rather than leaving a job that silently ended.
   */
  handleHttpJsonSubmitted = async (
    submission: HttpJsonSubmission,
  ): Promise<void> => {
    const result = await this.executeSubmission(submission);
    await this.#terminal.publish(
      buildJobTerminal(submission, result, this.#source),
    );
  };

  /**
   * One job, from the submission that started it to a modelled result.
   *
   * Separate from the handler because a result is not yet a Message: this is
   * where capacity, lifecycle facts and execution live, and terminal
   * construction sits above it. `callerSignal` has no producer yet -- no
   * cancellation Message or shutdown source exists -- but the mechanism stays
   * threaded through capacity and permits so one can be added without
   * reopening this path.
   */
  async executeSubmission(
    submission: HttpJsonSubmission,
    callerSignal?: AbortSignal,
  ): Promise<JobResult> {
    const acquisition = await this.#capacity.acquire(submission, callerSignal);
    if (acquisition.kind === "cancelled") {
      // No lifecycle facts recorded -- execution never reached "started".
      return cancelledResult();
    }

    try {
      return await this.#executeAdmitted(submission, callerSignal);
    } finally {
      acquisition.release();
    }
  }

  async #executeAdmitted(
    submission: HttpJsonSubmission,
    callerSignal: AbortSignal | undefined,
  ): Promise<JobResult> {
    validateSubmission(submission);

    // Re-checked after admission: the caller may have abandoned the job while
    // it was queued for capacity.
    if (callerSignal?.aborted) {
      return cancelledResult();
    }

    await this.#lifecycle.record(makeJobExecutionStartedEvent(submission));

    // The one place job identity stops travelling: JobRunner receives the work
    // and the mechanics for this invocation, never run/step/trace/source.
    // Worker keeps those to record facts and to construct the terminal from
    // the submission it retains.
    const outcome = await this.#runner.run(toHttpJsonWork(submission), {
      permitRequestId: submission.jobid,
      signal: callerSignal,
    });
    switch (outcome.kind) {
      case "completed": {
        const { output, exports } = outcome.outputs;
        await this.#lifecycle.record(
          makeJobExecutionCompletedEvent(submission, output, exports),
        );
        return completedResult(outcome.outputs);
      }
      case "failed":
        await this.#lifecycle.record(
          makeJobExecutionFailedEvent(submission, outcome.error),
        );
        return failedResult(outcome.error, outcome.output);
      case "cancelled":
        await this.#lifecycle.record(
          makeJobExecutionCancelledEvent(submission),
        );
        return cancelledResult();
    }
  }
}
