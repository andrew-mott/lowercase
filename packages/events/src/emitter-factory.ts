import type { EmitterFactoryPort, EventBusPort } from "@lcase/ports";
import type {
  StepScope,
  CloudScope,
  FlowScope,
  EngineScope,
  RunScope,
  JobScope,
  ToolScope,
  WorkerScope,
  SystemScope,
  AllJobEvents,
  AnyEvent,
  JobEventType,
  JobCompletedEvent,
  JobFailedEvent,
  JobStartedType,
  ReplayScope,
  SchedulerScope,
  LimiterScope,
} from "@lcase/types";
import { StepEmitter } from "./emitters/step.emitter.js";
import { FlowEmitter } from "./emitters/flow.emitter.js";
import type { OtelContext } from "./types.js";
import { randomBytes } from "crypto";
import { EngineEmitter } from "./emitters/engine.emitter.js";
import { RunEmitter } from "./emitters/run.emitter.js";
import { JobEmitter } from "./emitters/job.emitter.js";
import { ToolEmitter } from "./emitters/tool.emitter.js";
import { WorkerEmitter } from "./emitters/worker.emitter.js";
import { SystemEmitter } from "./emitters/system.emitter.js";
import { ReplayEmitter } from "./emitters/replay.emitter.js";
import { LimiterEmitter } from "./emitters/limiter.emitter.js";
import { SchedulerEmitter } from "./emitters/scheduler.emitter.js";

/**
 * NOTE: This class is currently in between being refactored.
 *
 * In order to preserve momentum on bootstrapping Observability,
 * this class is staying unfinished.
 *
 * Scopes, Shared Context Otel Features, Dependency Injection, and other issues will
 * be refactored in the future to allow easier otel creation, proper DI,
 * better DX for emitter creation and usage, and simplified types.
 *

 * Create emitter objects with respective emitter function.
 *
 * @param bus EventBusPort
 *
 * @member setScope(scope: BaseScope): void
 * @member newStepEmitter(): StepEmitter
 *
 * @examplegi
 * ```
 * const emitterFactory = new EmitterFactory();
 * const stepEmitter = newStepEmitter({...});
 * await stepEmitter.emit("event.type", data);
 *
 */

export class EmitterFactory implements EmitterFactoryPort {
  constructor(private readonly bus: EventBusPort) {}

  newLimiterEmitterNewTrace(
    scope: CloudScope & LimiterScope & { traceid: string },
  ) {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new LimiterEmitter(this.bus, combinedScope);
  }

  newLimiterEmitterNewSpan(scope: CloudScope & LimiterScope, traceId: string) {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new LimiterEmitter(this.bus, combinedScope);
  }

  newLimiterEmitterFromEvent(
    event: AnyEvent,
    scope: LimiterScope & { source: string },
  ): LimiterEmitter {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return new LimiterEmitter(this.bus, {
      ...scope,
      traceId: event.traceid,
      spanId,
      traceParent,
    });
  }

  newSchedulerEmitterFromEvent(
    event: AnyEvent,
    scope: SchedulerScope & { source: string },
  ): SchedulerEmitter {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return new SchedulerEmitter(this.bus, {
      ...scope,
      traceId: event.traceid,
      spanId,
      traceParent,
    });
  }

  newSchedulerEmitterNewSpan(
    scope: CloudScope & SchedulerScope,
    traceId: string,
  ): SchedulerEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new SchedulerEmitter(this.bus, combinedScope);
  }

  newReplayEmitterNewTrace(
    scope: CloudScope & ReplayScope,
    internal: boolean = true,
  ) {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new ReplayEmitter(this.bus, combinedScope, internal);
  }

  /* system */
  newSystemEmitter(
    scope: CloudScope & SystemScope & OtelContext,
  ): SystemEmitter {
    return new SystemEmitter(this.bus, scope);
  }
  newSystemEmitterNewSpan(
    scope: CloudScope & WorkerScope,
    traceId: string,
  ): SystemEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new SystemEmitter(this.bus, combinedScope);
  }

  /* engine */
  newEngineEmitter(
    scope: CloudScope & EngineScope & OtelContext,
  ): EngineEmitter {
    return new EngineEmitter(this.bus, scope);
  }
  /* worker */
  newWorkerEmitter(
    scope: CloudScope & WorkerScope & OtelContext,
  ): WorkerEmitter {
    return new WorkerEmitter(this.bus, scope);
  }
  newWorkerEmitterNewTrace(scope: CloudScope & WorkerScope): WorkerEmitter {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new WorkerEmitter(this.bus, combinedScope);
  }
  newWorkerEmitterNewSpan(
    scope: CloudScope & WorkerScope,
    traceId: string,
  ): WorkerEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new WorkerEmitter(this.bus, combinedScope);
  }
  /* flow */
  newFlowEmitter(scope: CloudScope & FlowScope & OtelContext): FlowEmitter {
    return new FlowEmitter(this.bus, scope);
  }
  newFlowEmitterNewSpan(
    scope: CloudScope & FlowScope,
    traceId: string,
  ): FlowEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new FlowEmitter(this.bus, combinedScope);
  }
  /* run */
  newRunEmitter(scope: CloudScope & RunScope & OtelContext): RunEmitter {
    return new RunEmitter(this.bus, scope);
  }
  newRunEmitterNewTrace(scope: CloudScope & RunScope): RunEmitter {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new RunEmitter(this.bus, combinedScope);
  }
  newRunEmitterNewSpan(
    scope: CloudScope & RunScope & { traceid: string },
  ): RunEmitter {
    const combinedScope = {
      ...scope,
      traceId: scope.traceid,
      ...this.makeNewSpan(scope.traceid),
    };
    return new RunEmitter(this.bus, combinedScope);
  }
  newRunEmitterFromEvent(
    event: JobCompletedEvent | JobFailedEvent,
    source: string,
  ): RunEmitter {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return this.newRunEmitter({
      source,
      flowid: event.flowid,
      flowversionid: event.flowversionid,
      runid: event.runid,
      traceId: event.traceid,
      spanId,
      traceParent,
    });
  }

  /* step */
  newStepEmitter(scope: CloudScope & StepScope & OtelContext): StepEmitter {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new StepEmitter(this.bus, combinedScope);
  }
  newStepEmitterNewTrace(scope: CloudScope & StepScope): StepEmitter {
    const combinedScope = { ...scope, ...this.startNewTrace() };
    return new StepEmitter(this.bus, combinedScope);
  }
  newStepEmitterNewSpan(
    scope: CloudScope & StepScope,
    traceId: string,
  ): StepEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new StepEmitter(this.bus, combinedScope);
  }
  newStepEmitterFromJobEvent(event: AnyEvent<JobEventType>, source: string) {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return this.newStepEmitter({
      source,
      flowid: event.flowid,
      flowversionid: event.flowversionid,
      runid: event.runid,
      stepid: event.stepid,
      steptype: event.capid,
      traceId: event.traceid,
      spanId,
      traceParent,
    });
  }
  /* job */
  newJobEmitter(scope: CloudScope & JobScope & OtelContext): JobEmitter {
    return new JobEmitter(this.bus, scope);
  }
  newJobEmitterNewSpan(
    scope: CloudScope & JobScope,
    traceId: string,
  ): JobEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new JobEmitter(this.bus, combinedScope);
  }
  newJobEmitterFromEvent(event: AllJobEvents, source: string) {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return this.newJobEmitter({
      source,
      flowid: event.flowid,
      flowversionid: event.flowversionid,
      runid: event.runid,
      stepid: event.stepid,
      jobid: event.jobid,
      traceId: event.traceid,
      spanId,
      traceParent,
      capid: event.capid,
      toolid: event.toolid,
    });
  }

  /* tool */
  newToolEmitter(scope: CloudScope & ToolScope & OtelContext): ToolEmitter {
    return new ToolEmitter(this.bus, scope);
  }
  newToolEmitterNewSpan(
    scope: CloudScope & ToolScope,
    traceId: string,
  ): ToolEmitter {
    const combinedScope = { ...scope, ...this.makeNewSpan(traceId), traceId };
    return new ToolEmitter(this.bus, combinedScope);
  }
  newToolEmitterFromEvent(event: AnyEvent<JobStartedType>, source: string) {
    const { spanId, traceParent } = this.makeNewSpan(event.traceid);
    return this.newToolEmitter({
      source,
      flowid: event.flowid,
      flowversionid: event.flowversionid,
      runid: event.runid,
      stepid: event.stepid,
      jobid: event.jobid,
      traceId: event.traceid,
      spanId,
      traceParent,
      capid: event.capid,
      toolid: event.toolid,
    });
  }

  makeNewSpan(traceId: string): { spanId: string; traceParent: string } {
    const spanId = this.generateSpanId();
    const traceParent = this.makeTraceParent(traceId, spanId);
    return { spanId, traceParent };
  }

  startNewTrace(sampled = true): {
    traceId: string;
    spanId: string;
    traceParent: string;
  } {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const traceParent = this.makeTraceParent(traceId, spanId, sampled);

    return { traceId, spanId, traceParent };
  }

  makeTraceParent(traceId: string, spanId: string, sampled = true): string {
    const version = "00";
    const flags = sampled ? "01" : "00";
    const traceParent = `${version}-${traceId}-${spanId}-${flags}`;
    return traceParent;
  }
  generateTraceId(): string {
    let id = "";
    do {
      id = randomBytes(16).toString("hex"); // 32 hex characters
    } while (/^0+$/.test(id)); // try again if all zeros
    return id;
  }

  generateSpanId() {
    let id = "";
    do {
      id = randomBytes(8).toString("hex"); // 16 hex characters
    } while (/^0+$/.test(id)); // try again if all zeros
    return id;
  }
}
