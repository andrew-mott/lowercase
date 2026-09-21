import type {
  EventSink,
  RunRepositoryPort,
  RunSettledPublisherPort,
  RunStepProjectionRepositoryPort,
} from "@lcase/ports";
import type { AnyEvent, RunIndex, RunStatus } from "@lcase/types";
import { hasRunId, updateRunIndex } from "@lcase/run-history";

type ShadowRunState = {
  index: RunIndex;
  traceId: string;
  source: string;
  flowId?: string;
  flowVersionId?: string;
  flowDefHash?: string;
  simId?: string;
  forkSpecHash?: string;
  experimentId?: string;
  targetRunId?: string;
  targetStepId?: string;
  targetExportName?: string;
  status: RunStatus;
  dirty: boolean;
  flushing: boolean;
  // Whether this sink has written the run row at least once. Steps hold a
  // foreign key to it, so they can only be written ahead of a terminal status
  // if the row is already there.
  rowWritten?: boolean;
};

const isTerminal = (status: RunStatus) =>
  status === "completed" || status === "failed";

export class SqlRunProjectionSink implements EventSink {
  id = "sql-run-projection-sink";
  #enableSink = true;
  #states = new Map<string, ShadowRunState>();

  constructor(
    private readonly runs: RunRepositoryPort,
    private readonly steps: RunStepProjectionRepositoryPort,
    private readonly runSettled?: RunSettledPublisherPort,
  ) {}

  async start(): Promise<void> {
    this.#enableSink = true;
  }

  async stop(): Promise<void> {
    this.#enableSink = false;
  }

  handle(event: AnyEvent): void {
    if (!this.#enableSink) return;
    if (!hasRunId(event)) return;

    const state = this.#updateState(event);
    if (!state) return;

    if (!state.flushing) {
      state.flushing = true;
      void this.#flushLoop(event.runid, state);
    }
  }

  #updateState(event: AnyEvent): ShadowRunState | undefined {
    const runId = hasRunId(event) ? event.runid : undefined;
    if (!runId) return;

    const existing = this.#states.get(runId);
    const index = updateRunIndex(event, existing?.index);
    if (!index) return;

    const state =
      existing ??
      ({
        index,
        traceId: event.traceid,
        source: event.source,
        status: "requested",
        dirty: false,
        flushing: false,
      } satisfies ShadowRunState);

    state.index = index;
    state.traceId = event.traceid;
    state.source = event.source;
    state.flowDefHash = this.#getFlowDefHash(event, state);

    if (event.type === "run.requested") {
      const requestedEvent = event as AnyEvent<"run.requested">;
      state.status = "requested";
      state.flowId = requestedEvent.data.flowId;
      state.flowVersionId = requestedEvent.data.flowVersionId;
      state.simId = requestedEvent.data.simId;
      state.forkSpecHash = requestedEvent.data.forkSpecHash;
      state.experimentId = requestedEvent.data.experimentId;
      state.targetRunId = requestedEvent.data.targetRunId;
      state.targetStepId = requestedEvent.data.targetStepId;
      state.targetExportName = requestedEvent.data.targetExportName;
    } else if (event.type === "run.started") {
      state.status = "started";
    } else if (event.type === "run.completed") {
      state.status = "completed";
    } else if (event.type === "run.failed") {
      state.status = "failed";
    } else if (event.type === "run.denied") {
      // The engine refused the run and nothing else will follow it, so this is
      // as final as a failure. Left alone, the run would stay requested forever.
      state.status = "failed";
    }

    state.dirty = true;
    this.#states.set(runId, state);
    return state;
  }

  #getFlowDefHash(event: AnyEvent, state: ShadowRunState): string | undefined {
    if (event.type === "run.requested") {
      const requestedEvent = event as AnyEvent<"run.requested">;
      return requestedEvent.data.flowDefHash;
    }

    const flowid = "flowid" in event ? event.flowid : undefined;
    return (
      state.flowDefHash ??
      state.index.flowDefHash ??
      state.index.flowId ??
      flowid
    );
  }

  async #flushLoop(runId: string, state: ShadowRunState): Promise<void> {
    while (state.dirty) {
      state.dirty = false;
      try {
        await this.#flushState(runId, state);
      } catch (error) {
        state.dirty = true;
        console.error(
          `[sql-run-projection-sink] error flushing run ${runId}: ${String(error)}`,
        );
        break;
      }
    }

    state.flushing = false;

    if (state.dirty && !state.flushing) {
      state.flushing = true;
      void this.#flushLoop(runId, state);
    }
  }

  async #flushState(runId: string, state: ShadowRunState): Promise<void> {
    const flowDefHash = state.flowDefHash;
    if (!flowDefHash) return;

    // A terminal status is stored last, after every step. The writes are not
    // transactional, so a reader that saw "completed" first could find the
    // run's final steps stale or missing.
    const status = state.status;
    const terminal = isTerminal(status);

    if (!terminal || !state.rowWritten) {
      await this.#writeRun(
        runId,
        state,
        flowDefHash,
        terminal ? "started" : status,
      );
      state.rowWritten = true;
    }

    for (const [stepId, step] of Object.entries(state.index.steps)) {
      const stepResult = await this.steps.upsertStepProjection({
        runId,
        stepId,
        status: step.status,
        startTime: step.startTime,
        endTime: step.endTime,
        duration: step.duration,
        reusedTime: step.reusedTime,
        wasReused: step.wasReused,
        outputHash: step.outputHash,
        exportHashes: step.exportHashes,
      });

      if (!stepResult.ok) throw new Error(stepResult.error);
    }

    if (terminal) {
      await this.#writeRun(runId, state, flowDefHash, status);
      this.runSettled?.settled(runId);
    }
  }

  async #writeRun(
    runId: string,
    state: ShadowRunState,
    flowDefHash: string,
    status: RunStatus,
  ): Promise<void> {
    const runResult = await this.runs.createRun({
      id: runId,
      traceId: state.traceId,
      status,
      source: state.source,
      ...(state.flowId ? { flowId: state.flowId } : {}),
      ...(state.flowVersionId ? { flowVersionId: state.flowVersionId } : {}),
      flowDefHash,
      ...(state.simId ? { simId: state.simId } : {}),
      ...(state.forkSpecHash ? { forkSpecHash: state.forkSpecHash } : {}),
      ...(state.experimentId ? { experimentId: state.experimentId } : {}),
      ...(state.targetRunId ? { targetRunId: state.targetRunId } : {}),
      ...(state.targetStepId ? { targetStepId: state.targetStepId } : {}),
      ...(state.targetExportName
        ? { targetExportName: state.targetExportName }
        : {}),
      ...(state.index.startTime ? { startTime: state.index.startTime } : {}),
      ...(state.index.endTime ? { endTime: state.index.endTime } : {}),
      ...(state.index.duration !== undefined
        ? { duration: state.index.duration }
        : {}),
    });
    if (!runResult.ok) throw new Error(runResult.error);
  }
}
