import type { ConcurrencyLimiterPort, SlotAccessDecision } from "@lcase/ports";
import type { EventBusPort } from "@lcase/ports/bus";
import type { EmitterFactoryPort } from "@lcase/ports/events";
import type { AnyEvent, ToolSpec } from "@lcase/types";

export type ToolCounters = {
  [ToolId in string]: {
    limit: number;
    count: number;
  };
};

export type JobEntry = {
  workerId: string;
  runId: string;
  jobId: string;
  traceId: string;
};

export type ToolQueues = {
  [ToolId in string]: JobEntry[];
};
/**
 * Implements concurrency logic per tool, either globally or per runtime.
 * Keeps an internal queue of denied requests, which are fulfilled when a
 * slot it freed up through the `worker.slot.finished` event.
 *
 * If something gets out of sync, and a worker emits a `worker.slot.requested`
 * event, the any queued jobs will be processed first, up to the concurrency
 * limit.
 *
 * Future versions should persist queues to disk or some other layer.
 */
export class ConcurrencyLimiter implements ConcurrencyLimiterPort {
  toolCounters: ToolCounters = {};
  toolQueues: ToolQueues = {};

  constructor(
    private readonly bus: EventBusPort,
    private readonly ef: EmitterFactoryPort,
  ) {}

  /**
   * Load a spec fom memory, initializing counters and queues for each tool.
   * @param toolSpecs ToolSpec[]
   */
  loadConfig(toolSpecs: ToolSpec[]) {
    for (const toolSpec of toolSpecs) {
      this.toolCounters[toolSpec.id] = {
        count: 0,
        limit: toolSpec.maxConcurrency,
      };
      this.toolQueues[toolSpec.id] = [];
    }
  }

  /**
   * Get an array of concurrency results, which eventually get emitted as
   * worker.slot.granted or worker.slot.denied events for each result.
   * @param event AnyEvent<"worker.slot.requested">
   * @returns ConcurrencyResult[]
   */
  slotRequestDecisions(
    event: AnyEvent<"worker.slot.requested">,
  ): SlotAccessDecision[] {
    const concurrencyResult: SlotAccessDecision[] = [];
    const { toolId } = event.data;
    if (!this.toolCounters[toolId]) return concurrencyResult;

    this.addQueuedSlots(toolId, concurrencyResult);
    concurrencyResult.push(this.grantOrDenyEvent(event));
    return concurrencyResult;
  }

  /**
   * If there is a slot, return a granted result and increment worker
   * Otherwise, deny the request and add it to the internal queue.
   * @param event AnyEvent<"worker.slot.requested">
   * @returns ConcurrencyResult
   */
  grantOrDenyEvent(
    event: AnyEvent<"worker.slot.requested">,
  ): SlotAccessDecision {
    const { toolId } = event.data;
    if (!this.hasSlot(toolId)) {
      this.toolQueues[toolId].push({
        workerId: event.workerid,
        runId: event.data.runId,
        jobId: event.data.jobId,
        traceId: event.traceid,
      });
      return {
        workerId: event.workerid,
        runId: event.data.runId,
        jobId: event.data.jobId,
        traceId: event.traceid,
        granted: false,
      };
    }

    this.toolCounters[toolId].count++;
    return {
      workerId: event.workerid,
      runId: event.data.runId,
      jobId: event.data.jobId,
      traceId: event.traceid,
      granted: true,
    };
  }

  /**
   * Loops through queued jobs for a tool id.  Goes until either the queue is
   * empty or until the concurrency limit is reached.
   * @param toolId string tool id
   * @returns ConcurrencyResult[]
   */
  addQueuedSlots(
    toolId: string,
    decisions: SlotAccessDecision[],
  ): SlotAccessDecision[] {
    const queue = this.toolQueues[toolId];

    while (this.hasSlot(toolId) && this.toolQueues[toolId].length > 0) {
      const result = queue.shift();
      if (result) {
        decisions.push({
          ...result,
          granted: true,
        });
        this.toolCounters[toolId].count++;
      }
    }
    return decisions;
  }

  /**
   * Decrement the tool count and get any queued jobs to start.
   * @param event AnyEvent<"worker.slot.finished">
   * @returns boolean
   */
  slotFinishedDecisions(
    event: AnyEvent<"worker.slot.finished">,
  ): SlotAccessDecision[] {
    const concurrencyResult: SlotAccessDecision[] = [];
    const { toolId } = event.data;
    if (this.toolCounters[toolId].count > 0) this.toolCounters[toolId].count--;
    this.addQueuedSlots(toolId, concurrencyResult);
    return concurrencyResult;
  }

  /**
   * Simple check to see if a tool has a slot, which is concurrency capacity.
   * Returns true if it does, false if it does not have an open slot.
   * @param toolId tool id string
   * @returns boolean
   */
  hasSlot(toolId: string) {
    if (!this.toolCounters[toolId]) return false;
    const { limit, count } = this.toolCounters[toolId];
    if (count < limit) return true;
    return false;
  }
}
