import type {
  ConcurrencyLimiterPort,
  SlotAccessDecision,
  EmitterFactoryPort,
  EventBusPort,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
import { defaultToolsConfig } from "./default-tools.config.js";

type BusTopic = string;
type Unsubscribe = ReturnType<EventBusPort["subscribe"]>;

export type LimiterDeps = {
  bus: EventBusPort;
  ef: EmitterFactoryPort;
  cl: ConcurrencyLimiterPort;
};

export class Limiter {
  id: string;
  scope: string;
  source: string;
  busTopics = new Map<BusTopic, Unsubscribe>();
  constructor(
    id: string,
    scope: string,
    private readonly deps: LimiterDeps,
    defaultConfig = true,
  ) {
    this.id = id;
    this.scope = scope;
    this.source = `lowercase://limiter/${scope}/${id}`;
    if (defaultConfig) this.deps.cl.loadConfig(defaultToolsConfig);
  }

  async start() {
    const slot = "worker.slot.requested";
    const slotFinished = "worker.slot.finished";
    this.busTopics.set(
      slot,
      this.deps.bus.subscribe(slot, async (event) =>
        this.handleSlotRequested(event),
      ),
    );
    this.busTopics.set(
      slotFinished,
      this.deps.bus.subscribe(slotFinished, async (event) =>
        this.handleSlotFinished(event),
      ),
    );
    // rate limiting not yet implemented
    // this.busTopics.set(
    //   token,
    //   this.deps.bus.subscribe(token, async () => {})
    // );

    const emitter = this.deps.ef.newLimiterEmitterNewTrace({
      limiterid: this.id,
      source: this.source,
    });

    await emitter.emit("limiter.started", { status: "started" });
  }
  // unsubscribe from all bus topics
  async stop() {
    for (const unsubscribe of this.busTopics.values()) {
      unsubscribe();
    }
    this.busTopics.clear();
    const emitter = this.deps.ef.newLimiterEmitterNewTrace({
      limiterid: this.id,
      source: this.source,
    });

    await emitter.emit("limiter.stopped", { status: "stopped" });
  }

  async handleSlotRequested(event: AnyEvent) {
    // see if concurrency is at limit
    if (event.type !== "worker.slot.requested") return;
    const e = event as AnyEvent<"worker.slot.requested">;
    const concurrencyDecisions = this.deps.cl.slotRequestDecisions(event);

    for (const decision of concurrencyDecisions) {
      await this.emitResponse(decision, e.data.toolId);
    }
  }

  async handleSlotFinished(event: AnyEvent) {
    if (event.type !== "worker.slot.finished") return;
    const e = event as AnyEvent<"worker.slot.finished">;

    const concurrencyDecisions = this.deps.cl.slotFinishedDecisions(event);
    for (const decision of concurrencyDecisions) {
      await this.emitResponse(decision, e.data.toolId);
    }
  }

  async emitResponse(decision: SlotAccessDecision, toolId: string) {
    const emitter = this.deps.ef.newLimiterEmitterNewSpan(
      {
        limiterid: this.id,
        source: this.source,
      },
      decision.traceId,
    );
    if (decision.granted) {
      await emitter.emit("limiter.slot.granted", {
        jobId: decision.jobId,
        runId: decision.runId,
        toolId,
        workerId: decision.workerId,
        status: "granted",
      });
    } else {
      await emitter.emit("limiter.slot.denied", {
        jobId: decision.jobId,
        runId: decision.runId,
        toolId,
        workerId: decision.workerId,
        status: "denied",
      });
    }
  }
}
